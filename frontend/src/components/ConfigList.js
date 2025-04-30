import React, { useEffect, useState } from 'react';

const ConfigList = ({ ws }) => {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ws) return;

    let didSend = false;

    // Function to send the list_configs command
    const sendListConfigs = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ command: "list_configs", args: [] }));
        didSend = true;
      }
    };

    // Handler for incoming messages
    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'ok' && Array.isArray(data.configs)) {
          setConfigs(data.configs);
          setLoading(false);
        }
      } catch (e) {
        // Handle parse error or ignore unrelated messages
      }
    };

    // If ws is already open, send immediately
    if (ws.readyState === WebSocket.OPEN) {
      sendListConfigs();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      // Otherwise, wait for the connection to open
      ws.addEventListener('open', sendListConfigs, { once: true });
    }

    ws.addEventListener('message', handleMessage);

    // Cleanup
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
          {configs.map(cfg => (
            <li key={cfg.id} className="list-group-item mb-2">
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
          ))}
        </ul>
      )}
    </div>
  );
};

export default ConfigList;
