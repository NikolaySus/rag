import React, { useEffect, useRef, useState } from "react";
import ConfigCreateForm from "./ConfigCreateForm";
import ScriptsListPopup from "./ScriptsListPopup";

const ConfigList = ({
  ws,
  selectedId,
  onSelect,
  runningConfigIds = [],
  reloadKey,
  onConfigsLoaded,
}) => {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showScriptsPopup, setShowScriptsPopup] = useState(false);

  // Ref to keep track of previous config ids
  const prevConfigIdsRef = useRef([]);

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
        if (data.status === "ok" && Array.isArray(data.configs)) {
          // Detect new config IDs
          const newConfigIds = data.configs.map((cfg) => cfg.id);
          const prevConfigIds = prevConfigIdsRef.current;
          // Find ids that are in newConfigIds but not in prevConfigIds
          const addedIds = newConfigIds.filter(
            (id) => !prevConfigIds.includes(id)
          );
          setConfigs(data.configs);
          setLoading(false);
          if (typeof onConfigsLoaded === "function") {
            onConfigsLoaded(data.configs);
          }
          // If a new config was added, select it
          if (addedIds.length > 0 && typeof onSelect === "function") {
            onSelect(addedIds[0]);
          }
          // Update the ref for next time
          prevConfigIdsRef.current = newConfigIds;
        }
      } catch (e) {}
    };

    if (ws.readyState === WebSocket.OPEN) {
      sendListConfigs();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.addEventListener("open", sendListConfigs, { once: true });
    }

    ws.addEventListener("message", handleMessage);

    return () => {
      if (!didSend && ws.readyState === WebSocket.CONNECTING) {
        ws.removeEventListener("open", sendListConfigs, { once: true });
      }
      ws.removeEventListener("message", handleMessage);
    };
  }, [ws]);

  useEffect(() => {
    // On mount, initialize prevConfigIdsRef
    prevConfigIdsRef.current = configs.map((cfg) => cfg.id);
    const cleanup = fetchConfigs();
    return cleanup;
  }, [fetchConfigs, reloadKey]);

  // Modal backdrop and dialog
  const Modal = ({ children, onClose }) => (
    <div
      className="modal fade show"
      style={{
        display: "block",
        background: "rgba(0,0,0,0.3)",
        position: "fixed",
        zIndex: 1050,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
      tabIndex="-1"
      onClick={onClose}
    >
      <div
        className="modal-dialog"
        style={{ pointerEvents: "auto", marginTop: "10vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );

  return (
    <div className="p-3">
      <h3 className="mb-4">RAG Конвейеры</h3>
      {loading ? (
        <div className="text-secondary">Загрузка...</div>
      ) : (
        <>
          <ul className="list-group">
            {configs.map((cfg) => {
              const isSelected = selectedId === cfg.id;
              const isRunning = runningConfigIds.includes(cfg.id);
              let itemClass = "list-group-item mb-2 cursor-pointer";
              if (isRunning) itemClass += " list-group-item-success";
              if (isSelected) itemClass += " config-list-item-selected";
              return (
                <li
                  key={cfg.id}
                  className={itemClass}
                  style={{ cursor: "pointer", position: "relative" }}
                  onClick={() => onSelect && onSelect(cfg.id)}
                >
                  <div className="d-flex justify-content-between align-items-center">
                    <span>
                      <span className="fw-bold">{cfg.name}</span>
                      <span className="text-muted ms-2 small">
                        {cfg.active ? "🟢" : "⚪"}
                      </span>
                    </span>
                    <span>
                      <span className="badge bg-secondary me-2">
                        id: {cfg.id}
                      </span>
                    </span>
                  </div>
                  <div className="text-muted small mt-1">
                    Создан: {cfg.created_at}
                  </div>
                  <div className="text-muted small">
                    Изменён: {cfg.updated_at}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="d-flex flex-column align-items-end mt-4 gap-2">
            <button
              className="btn btn-primary"
              onClick={() => {
                setShowCreateModal(true);
                onSelect(null);
              }}
            >
              + Создать новый
            </button>
            <button
              className="btn btn-outline-secondary"
              onClick={() => {
                setShowScriptsPopup(true);
              }}
            >
              Список скриптов
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
      {showScriptsPopup && (
        <ScriptsListPopup
          ws={ws}
          open={showScriptsPopup}
          onClose={() => setShowScriptsPopup(false)}
        />
      )}
    </div>
  );
};

export default ConfigList;
