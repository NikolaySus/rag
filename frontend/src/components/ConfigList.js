import React, { useEffect, useState } from 'react';
import ConfigCreateForm from './ConfigCreateForm';

const ConfigList = ({ ws, selectedId, onSelect, runningConfigIds = [] }) => {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  // Fetch configs
  const fetchConfigs = React.useCallback(() => {
    if (!ws) return;

    let didSend = false;

    const sendListConfigs = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ command: "list_configs", args: [] }));
        didSend = true;
      }
    };

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'ok' && Array.isArray(data.configs)) {
          setConfigs(data.configs);
          setLoading(false);
        }
      } catch (e) {}
    };

    if (ws.readyState === WebSocket.OPEN) {
      sendListConfigs();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.addEventListener('open', sendListConfigs, { once: true });
    }

    ws.addEventListener('message', handleMessage);

    return () => {
      if (!didSend && ws.readyState === WebSocket.CONNECTING) {
        ws.removeEventListener('open', sendListConfigs, { once: true });
      }
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws]);

  useEffect(() => {
    const cleanup = fetchConfigs();
    return cleanup;
  }, [fetchConfigs]);

  // Delete config handler
  const handleDelete = (id) => {
    if (!ws || deletingId) return;
    setDeleteError(null);
    setDeletingId(id);

    const message = {
      command: "delete_config",
      args: [id],
    };

    const handleDeleteResponse = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "ok" && data.deleted_id === id) {
          setDeletingId(null);
          ws.removeEventListener("message", handleDeleteResponse);
          setLoading(true);
          // Deselect if the deleted config was selected
          if (selectedId === id && typeof onSelect === "function") {
            onSelect(null);
          }
          fetchConfigs();
        } else if (data.status === "error") {
          setDeleteError(data.message || "Error deleting config");
          setDeletingId(null);
          ws.removeEventListener("message", handleDeleteResponse);
        }
      } catch (e) {}
    };

    ws.addEventListener("message", handleDeleteResponse);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  // Modal backdrop and dialog
  const Modal = ({ children, onClose }) => (
    <div
      className="modal fade show"
      style={{
        display: 'block',
        background: 'rgba(0,0,0,0.3)',
        position: 'fixed',
        zIndex: 1050,
        top: 0, left: 0, right: 0, bottom: 0,
      }}
      tabIndex="-1"
      onClick={onClose}
    >
      <div
        className="modal-dialog"
        style={{ pointerEvents: 'auto', marginTop: '10vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-3">
      <h3 className="mb-4">Configs</h3>
      {loading ? (
        <div className="text-secondary">Loading...</div>
      ) : (
        <>
          {deleteError && (
            <div className="alert alert-danger">{deleteError}</div>
          )}
          <ul className="list-group">
            {configs.map(cfg => {
            const isSelected = selectedId === cfg.id;
            const isRunning = runningConfigIds.includes(cfg.id);
            let itemClass = "list-group-item mb-2 cursor-pointer";
            if (isRunning) itemClass += " list-group-item-success";
            if (isSelected) itemClass += " config-list-item-selected";
            return (
              <li
                key={cfg.id}
                className={itemClass}
                style={{ cursor: 'pointer', position: 'relative' }}
                onClick={() => onSelect && onSelect(cfg.id)}
              >
                <div className="d-flex justify-content-between align-items-center">
                  <span>
                    <span className="fw-bold">{cfg.name}</span>
                    <span className="text-muted ms-2 small">({cfg.type})</span>
                  </span>
                  <span>
                    <span className="badge bg-secondary me-2">id: {cfg.id}</span>
                    <button
                      className="btn btn-sm btn-danger"
                      style={{ minWidth: 70 }}
                      onClick={e => {
                        e.stopPropagation();
                        handleDelete(cfg.id);
                      }}
                      disabled={deletingId === cfg.id}
                      title="Delete config"
                    >
                      {deletingId === cfg.id ? "Deleting..." : "Delete"}
                    </button>
                  </span>
                </div>
                <div className="text-muted small mt-1">Created: {cfg.created_at}</div>
                <div className="text-muted small">Updated: {cfg.updated_at}</div>
              </li>
            );
          })}
          </ul>
          <div className="d-flex justify-content-end mt-4">
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              + Create Config
            </button>
          </div>
        </>
      )}
      {showCreateModal && (
        <Modal onClose={() => setShowCreateModal(false)}>
          <ConfigCreateForm
            ws={ws}
            onClose={() => setShowCreateModal(false)}
            onCreated={() => {
              setShowCreateModal(false);
              setLoading(true);
              fetchConfigs();
            }}
          />
        </Modal>
      )}
    </div>
  );
};

export default ConfigList;
