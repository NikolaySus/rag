import React, { useEffect, useState, useRef } from 'react';
import AnsiToHtml from 'ansi-to-html';
import splitAnsiLineByVisibleLength from '../utils/splitAnsiLineByVisibleLength';

const ansiConverter = new AnsiToHtml({
  fg: '#e0e0e0',
  bg: '#181818',
  newline: true,
  escapeXML: true,
  stream: false,
});

/**
 * Terminal state shape:
 * {
 *   [configId]: {
 *     lines: string[],
 *     currentRun: { configId, runNumber } | null
 *   }
 * }
 */
const ConfigDetails = ({ ws, configId, runStatus, onRun }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);

  // Form state
  const [indexer, setIndexer] = useState('true');
  const [query, setQuery] = useState('');

  // Terminal output state per config
  const [terminalState, setTerminalState] = useState({});
  const terminalRef = useRef(null);

  // Helper to get current config's terminal state
  const getCurrentTerminal = () => terminalState[configId] || { lines: [], currentRun: null };

  // Handle terminal output from WebSocket
  useEffect(() => {
    if (!ws) return;

    const handleTerminalOutput = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Only handle output messages with 'from' field
        if (data.status === 'output' && Array.isArray(data.from) && data.from.length === 2) {
          const [msgConfigId, msgRunNumber] = data.from;
          const key = String(msgConfigId);
          setTerminalState(prevState => {
            const prev = prevState[key] || { lines: [], currentRun: null };
            // Only show output for the current run of this config
            if (
              !prev.currentRun || String(msgRunNumber) === String(prev.currentRun.runNumber)
            ) {
              let lines = [...prev.lines];
              let output = data.output || '';
              // Emulate carriage return: overwrite the last line
              if (output.startsWith('\r')) {
                output = output.replace(/^\r/, '');
                if (lines.length === 0) {
                  // Split and push all chunks
                  splitAnsiLineByVisibleLength(output).forEach(chunk => lines.push(chunk));
                  lines.pop();
                } else {
                  // Overwrite last line, but may need to split into multiple lines
                  // Remove the last line, then add all chunks
                  lines.pop();
                  splitAnsiLineByVisibleLength(output).forEach(chunk => lines.push(chunk));
                  lines.pop();
                }
              } else {
                // Split output by newlines, then split each line by length and append
                const splitLines = output.split('\n');
                splitLines.forEach((line, idx) => {
                  splitAnsiLineByVisibleLength(line).forEach(chunk => lines.push(chunk));
                });
              }
              // Limit terminal buffer size (optional)
              if (lines.length > 500) lines = lines.slice(lines.length - 500);
              return {
                ...prevState,
                [key]: {
                  ...prev,
                  lines,
                }
              };
            }
            return prevState;
          });
        }
        // Optionally handle completion
        if (
          data.status === 'ok' &&
          Array.isArray(data.from) &&
          data.from.length === 2
        ) {
          const [msgConfigId, msgRunNumber] = data.from;
          const key = String(msgConfigId);
          setTerminalState(prevState => {
            const prev = prevState[key] || { lines: [], currentRun: null };
            if (
              prev.currentRun &&
              String(msgRunNumber) === String(prev.currentRun.runNumber)
            ) {
              return {
                ...prevState,
                [key]: {
                  ...prev,
                  lines: [...prev.lines, '[Execution finished]'],
                }
              };
            }
            return prevState;
          });
        }
      } catch (e) {}
    };

    ws.addEventListener('message', handleTerminalOutput);
    return () => {
      ws.removeEventListener('message', handleTerminalOutput);
    };
  }, [ws]);

  // When a new run starts, reset terminal output and set currentRun for this config
  useEffect(() => {
    if (runStatus?.status === 'running' && runStatus.runNumber && configId) {
      setTerminalState(prevState => ({
        ...prevState,
        [configId]: {
          lines: [],
          currentRun: { configId, runNumber: runStatus.runNumber }
        }
      }));
    }
  }, [runStatus, configId]);

  // Auto-scroll terminal to bottom on new output
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [configId, terminalState]);

  // Fetch config details
  useEffect(() => {
    if (!ws || !configId) {
      setConfig(null);
      return;
    }

    setLoading(true);

    const sendGetConfig = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ command: "get_config", args: [String(configId)] }));
      }
    };

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'ok' && data.config && String(data.config.id) === String(configId)) {
          setConfig(data.config);
          setLoading(false);
        }
      } catch (e) {}
    };

    if (ws.readyState === WebSocket.OPEN) {
      sendGetConfig();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.addEventListener('open', sendGetConfig, { once: true });
    }

    ws.addEventListener('message', handleMessage);

    return () => {
      ws.removeEventListener('message', handleMessage);
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.removeEventListener('open', sendGetConfig, { once: true });
      }
    };
  }, [ws, configId]);

  // Run form submit
  const handleRun = (e) => {
    e.preventDefault();
    if (!ws || !configId) return;
    if (onRun) onRun(configId, indexer, query);
    // Terminal will be reset in useEffect above
  };

  if (!configId) {
    return <div className="text-muted">Select a config to view details.</div>;
  }

  if (loading) {
    return <div className="text-secondary">Loading config...</div>;
  }

  if (!config) {
    return <div className="text-danger">No config data available.</div>;
  }

  const { lines: terminalLines } = getCurrentTerminal();

  return (
    <div>
      <h2 className="mb-3">Config Details</h2>
      <div className="mb-2">
        <span className="fw-bold">{config.name}</span>
        <span className="text-muted ms-2">({config.type})</span>
        <span className="badge bg-secondary ms-2">id: {config.id}</span>
      </div>
      <div className="text-muted small mb-2">Created: {config.created_at}</div>
      <div className="text-muted small mb-3">Updated: {config.updated_at}</div>
      <h5>Content</h5>
      <pre className="app-json-pre">{config.content}</pre>
      <hr />
      <form className="mb-3" onSubmit={handleRun}>
        <div className="row align-items-end">
          <div className="col-auto">
            <label className="form-label mb-0">Indexer</label>
            <select
              className="form-select"
              value={indexer}
              onChange={e => setIndexer(e.target.value)}
              style={{ minWidth: 80 }}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          <div className="col-auto">
            <label className="form-label mb-0">Query</label>
            <input
              className="form-control"
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Enter query"
              required
            />
          </div>
          <div className="col-auto">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={runStatus?.status === 'running'}
            >
              Run
            </button>
          </div>
          <div className="col-auto">
            <span>
              Status:{' '}
              {runStatus?.status === 'idle' && <span className="text-secondary">Idle</span>}
              {runStatus?.status === 'running' && <span className="text-warning">Running</span>}
              {runStatus?.status === 'ok' && <span className="text-success">OK</span>}
              {runStatus?.status === 'error' && <span className="text-danger">Error</span>}
              {runStatus?.runNumber && (
                <span className="ms-2 badge bg-info text-dark">Run #{runStatus.runNumber}</span>
              )}
            </span>
          </div>
        </div>
      </form>
      {/* Terminal-like output area */}
      <div
        ref={terminalRef}
        style={{
          background: '#181818',
          color: '#e0e0e0',
          fontFamily: 'monospace',
          fontSize: '0.95em',
          borderRadius: 4,
          padding: '12px',
          minHeight: '120px',
          maxHeight: '320px',
          overflowY: 'auto',
          marginBottom: '1rem',
          border: '1px solid #333',
        }}
        aria-label="Terminal output"
      >
        {terminalLines.length === 0 ? (
          <span style={{ color: '#666' }}>No output yet.</span>
        ) : (
          terminalLines.map((line, idx) => (
            <div
              key={idx}
              dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(line) }}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ConfigDetails;
