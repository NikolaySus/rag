import AnsiToHtml from 'ansi-to-html';
import { useEffect, useRef, useState } from 'react';
import CalculationsTablePopup from './CalculationsTablePopup';
import ConfigCreateForm from './ConfigCreateForm';

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
const ConfigDetails = ({ ws, configId, setSelectedConfigId, runStatus, onRun, onStop, onConfigDeleted, onConfigsChanged, configs = [] }) => {  
  // Add state for popup
  const [showCalculations, setShowCalculations] = useState(false);

  const [configActive, setConfigActive] = useState(false); // Separate state for active status
  const [loading, setLoading] = useState(false);
  // Form state
  const [indexer, setIndexer] = useState('true');
  const [query, setQuery] = useState('');
  
  // Delete state
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Deactivate state
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState(null);

  // Terminal output state per config
  const [terminalState, setTerminalState] = useState({});
  const terminalRef = useRef(null);

  // Helper to get current config's terminal state
  const getCurrentTerminal = () => terminalState[configId] || { lines: [], currentRun: null };

  // Sync configActive from configs prop
  useEffect(() => {
    if (!configId || !Array.isArray(configs)) return;
    const found = configs.find(c => String(c.id) === String(configId));
    if (found) {
      setConfigActive(found.active);
      setLoading(false);
    }
  }, [configs, configId]);

  // Handle terminal output and deletion from WebSocket
  useEffect(() => {
    if (!ws) return;

    const handleTerminalOutput = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle config deletion: if current config is deleted, notify parent
        if (
          data.command === "delete_config" ||
          (data.status === "ok" && typeof data.deleted_id !== "undefined")
        ) {
          const deletedId = data.deleted_id ?? (Array.isArray(data.args) ? data.args[0] : undefined);
          if (String(deletedId) === String(configId) && typeof onConfigDeleted === "function") {
            onConfigDeleted();
          }
        }

        // Handle deactivate/close response
        if (
          data.command === "close" ||
          (data.status === "ok" && typeof data.closed_id !== "undefined")
        ) {
          const closedId = data.closed_id ?? (Array.isArray(data.args) ? data.args[0] : undefined);
          if (String(closedId) === String(configId)) {
            setDeactivating(false);
            setDeactivateError(null);
            setConfigActive(false); // Update configActive to false
            if (typeof onConfigsChanged === "function") {
              onConfigsChanged();
            }
          }
        }
        if (data.status === "error" && data.command === "close") {
          setDeactivating(false);
          setDeactivateError(data.message || "Error deactivating config");
        }
        
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
                  lines.push(output);
                } else {
                  lines.pop();
                  lines.push(output);
                }
              } else {
                // Check if the last line ends with a newline character
                const lastLineEndsWithNewline = lines.length > 0 && lines[lines.length - 1].endsWith('\n');
                const splitLines = output.split('\n');
                splitLines.forEach((line, idx) => {
                  if (idx === 0 && lines.length > 0 && !lastLineEndsWithNewline) {
                    // Append to the last line if it doesn't end with a newline
                    lines[lines.length - 1] += line;
                  } else {
                    lines.push(line);
                  }
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
        // if (
        //   data.status === 'ok' &&
        //   Array.isArray(data.from) &&
        //   data.from.length === 2
        // ) {
        //   const [msgConfigId, msgRunNumber] = data.from;
        //   const key = String(msgConfigId);
        //   setTerminalState(prevState => {
        //     const prev = prevState[key] || { lines: [], currentRun: null };
        //     if (
        //       prev.currentRun &&
        //       String(msgRunNumber) === String(prev.currentRun.runNumber)
        //     ) {
        //       return {
        //         ...prevState,
        //         [key]: {
        //           ...prev,
        //           lines: [...prev.lines, '[Execution finished]'],
        //         }
        //       };
        //     }
        //     return prevState;
        //   });
        // }
      } catch (e) {}
    };

    ws.addEventListener('message', handleTerminalOutput);
    return () => {
      ws.removeEventListener('message', handleTerminalOutput);
    };
  }, [ws, configId, onConfigDeleted, onConfigsChanged]);

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


  // Run form submit
  const handleRun = (e) => {
    e.preventDefault();
    if (!ws || !configId) return;
    if (onRun) onRun(configId, indexer, query);
    // Terminal will be reset in useEffect above
    if (typeof onConfigsChanged === "function") {
      setTimeout(function() {onConfigsChanged();}, 42);
    }
  };

  // Deactivate config logic
  const handleDeactivate = () => {
    if (!ws || !configId || deactivating || !configActive) return;
    setDeactivateError(null);
    setDeactivating(true);

    const message = {
      command: "close",
      args: [String(configId)],
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }

    if (onStop) onStop(configId);
  };

  // Delete config logic
  const handleDelete = () => {
    if (!ws || !configId || deleting) return;
    setDeleteError(null);
    setDeleting(true);

    const message = {
      command: "delete_config",
      args: [configId],
    };

    const handleDeleteResponse = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "ok" && data.deleted_id === configId) {
          setDeleting(false);
          ws.removeEventListener("message", handleDeleteResponse);
          setShowDeleteConfirm(false); // Close the modal after successful delete
          if (typeof onConfigDeleted === "function") {
            onConfigDeleted();
          }
          if (typeof onConfigsChanged === "function") {
            onConfigsChanged();
          }
          if (typeof setSelectedConfigId === "function") {
            setSelectedConfigId(null);
          }
        } else if (data.status === "error") {
          setDeleteError(data.message || "Error deleting config");
          setDeleting(false);
          ws.removeEventListener("message", handleDeleteResponse);
        }
      } catch (e) {}
    };

    ws.addEventListener("message", handleDeleteResponse);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  if (!configId) {
    return <div className="text-muted">...</div>;
  }

  if (loading) {
    return <div className="text-secondary">Загрузка конфигурации конвейера...</div>;
  }

  const { lines: terminalLines } = getCurrentTerminal();

  return (
    <div>
      <h2 className="mb-3 d-flex justify-content-between align-items-center">
        <span>Конфигурация конвейера</span>
        <span className="d-flex gap-2">
          <button
            className="btn btn-outline-secondary btn-sm me-2"
            onClick={handleDeactivate}
            disabled={deactivating || !configActive}
            title={!configActive ? "Выключен" : "Выключить этот конвейер"}
          >
            {deactivating ? "Выключение..." : "Выключить"}
          </button>
          <button
            className="btn btn-outline-danger btn-sm"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleting}
            title="Удалить этот конвейер"
          >
            {deleting ? "Удаление..." : "Удалить"}
          </button>
        </span>
      </h2>
      {deactivateError && (
        <div className="alert alert-danger">{deactivateError}</div>
      )}
      {deleteError && (
        <div className="alert alert-danger">{deleteError}</div>
      )}
      {showDeleteConfirm && (
        <div className="modal fade show" style={{
          display: 'block',
          background: 'rgba(0,0,0,0.3)',
          position: 'fixed',
          zIndex: 1050,
          top: 0, left: 0, right: 0, bottom: 0,
        }}>
          <div className="modal-dialog" style={{ pointerEvents: 'auto', marginTop: '10vh' }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Подтверждение удаления</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setShowDeleteConfirm(false)} />
              </div>
              <div className="modal-body">
                <p>Вы уверены, что хотите удалить этот конвейер?</p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Отмена</button>
                <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Удаление..." : "Удалить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfigCreateForm
        ws={ws}
        mode="edit"
        configId={configId}
        autoSave
        onConfigsChanged={onConfigsChanged}
      />
      <hr />
      <form className="mb-3" onSubmit={handleRun}>
        <div className="row align-items-end">
          <div className="col-auto">
            <label className="form-label mb-0">Задача</label>
            <select
              className="form-select"
              value={indexer}
              onChange={e => setIndexer(e.target.value)}
              style={{ minWidth: 80 }}
            >
              <option value="true">Индексация</option>
              <option value="false">Генерация</option>
            </select>
          </div>
          <div className="col-auto">
            <label className="form-label mb-0">Запрос</label>
            <input
              className="form-control"
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Введите запрос"
              required
            />
          </div>
          <div className="col-auto">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={runStatus?.status === 'running'}
            >
              Пуск
            </button>
          </div>
          <div className="col-auto">
            <button
              type="button"
              className="btn btn-outline-info"
              onClick={() => setShowCalculations(true)}
              style={{ minWidth: 90 }}
            >
              Отчёты
            </button>
          </div>
          <div className="col-auto">
            <span>
              Ядро:{' '}
              {runStatus?.status === 'idle' && <span className="text-secondary">Не активно</span>}
              {runStatus?.status === 'running' && <span className="text-warning">Работает</span>}
              {runStatus?.status === 'ok' && <span className="text-success">Ок</span>}
              {runStatus?.status === 'error' && <span className="text-danger">Ошибка</span>}
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
          <span style={{ color: '#666' }}>Пока нет выходных данных.</span>
        ) : (
          terminalLines.map((line, idx) => (
            <div
              key={idx}
              dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(line) }}
            />
          ))
        )}
      </div>
      <CalculationsTablePopup
        ws={ws}
        configId={configId}
        open={showCalculations}
        onClose={() => setShowCalculations(false)}
      />
    </div>
  );
};

export default ConfigDetails;
