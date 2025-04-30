import React, { useEffect, useState } from 'react';

const ConfigDetails = ({ ws, configId, runStatus, onRun }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);

  // Form state
  const [indexer, setIndexer] = useState('true');
  const [query, setQuery] = useState('');

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
    </div>
  );
};

export default ConfigDetails;
