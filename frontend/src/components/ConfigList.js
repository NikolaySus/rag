import React, { useEffect, useState } from 'react';

const ConfigList = ({ ws, selectedId, onSelect, runningConfigIds = [] }) => {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  return (
    <div className="p-3">
      <h3 className="mb-4">Configs</h3>
      {loading ? (
        <div className="text-secondary">Loading...</div>
      ) : (
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
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect && onSelect(cfg.id)}
              >
                <div className="d-flex justify-content-between align-items-center">
                  <span>
                    <span className="fw-bold">{cfg.name}</span>
                    <span className="text-muted ms-2 small">({cfg.type})</span>
                  </span>
                  <span className="badge bg-secondary">id: {cfg.id}</span>
                </div>
                <div className="text-muted small mt-1">Created: {cfg.created_at}</div>
                <div className="text-muted small">Updated: {cfg.updated_at}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ConfigList;
