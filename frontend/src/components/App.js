import React, { useEffect, useRef, useState, useCallback } from 'react';
import ConfigList from './ConfigList';
import ConfigDetails from './ConfigDetails';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

const App = () => {
  const [loaded, setLoaded] = useState(false);
  const [placeholder, setPlaceholder] = useState("Loading");
  const [selectedConfigId, setSelectedConfigId] = useState(null);
  const [runningConfigIds, setRunningConfigIds] = useState([]);
  const [runStatusMap, setRunStatusMap] = useState({}); // { [configId]: { status, runNumber } }
  const wsRef = useRef(null);
  const [configsReloadKey, setConfigsReloadKey] = useState(0);
  const [configs, setConfigs] = useState([]); // New: configs state for sharing with ConfigDetails

  const handleConfigsChanged = () => {
    setConfigsReloadKey(k => k + 1); // Triggers ConfigList to reload
  };

  // Handler to receive configs from ConfigList
  const handleConfigsLoaded = (configsList) => {
    setConfigs(configsList);
  };

  // Central message handler
  useEffect(() => {
    if (wsRef.current) return;

    const ws = new WebSocket('ws://127.0.0.1:8000/ws/kmengine/');
    wsRef.current = ws;

    ws.onopen = () => {
      setLoaded(true);
      setPlaceholder("Connected");
    };

    ws.onerror = () => {
      setPlaceholder("WebSocket error");
    };

    ws.onclose = () => {
      setPlaceholder("WebSocket closed");
    };

    // Central message handler for all run statuses
    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle run status messages (ignore 'output')
        if ((data.status === 'ok' || data.status === 'error') && Array.isArray(data.from)) {
          const configId = String(data.from[0]);
          const runNumber = data.from[1];
          setRunStatusMap(prev => ({
            ...prev,
            [configId]: { status: data.status, runNumber }
          }));
          setRunningConfigIds(prev => prev.filter(id => String(id) !== configId));
        }
        // If a run is started, handled by runConfig below
      } catch (e) {}
    };

    ws.addEventListener('message', handleMessage);

    // Cleanup
    return () => {
      ws.removeEventListener('message', handleMessage);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Run a config (called from ConfigDetails)
  const runConfig = useCallback((configId, indexer, query) => {
    if (!wsRef.current || !configId) return;
    // Set status to running
    setRunStatusMap(prev => ({
      ...prev,
      [String(configId)]: { status: 'running', runNumber: null }
    }));
    setRunningConfigIds(prev =>
      prev.includes(configId) ? prev : [...prev, configId]
    );
    wsRef.current.send(
      JSON.stringify({
        command: 'run',
        args: [String(configId), indexer, query]
      })
    );
  }, []);

  const updateStopConfig = useCallback((configId) => {
    if (!configId) return;
    // Set status to idle
    setRunStatusMap(prev => ({
      ...prev,
      [String(configId)]: { status: 'idle', runNumber: null }
    }));
    setRunningConfigIds(prev =>
      prev.includes(configId) ? prev.filter(e => e !== configId) : prev
    );
  }, []);

  // Get run status for a config
  const getRunStatus = (configId) => {
    return runStatusMap[String(configId)] || { status: 'idle', runNumber: null };
  };

  return (
    <div className="container-fluid vh-100">
      <div className="row h-100">
        <div className="col-12 col-md-3 col-lg-2 p-0 border-end bg-light">
          <ConfigList
            ws={wsRef.current}
            selectedId={selectedConfigId}
            onSelect={setSelectedConfigId}
            runningConfigIds={runningConfigIds}
            reloadKey={configsReloadKey} // Pass reloadKey to force re-fetch
            onConfigsLoaded={handleConfigsLoaded} // New: pass handler
          />
        </div>
        <div className="col p-4">
          <div className="mb-2">
            <span className={`badge ${loaded ? 'bg-success' : 'bg-secondary'}`}>
              {loaded ? "Connected" : placeholder}
            </span>
          </div>
          <ConfigDetails
            ws={wsRef.current}
            configId={selectedConfigId}
            setSelectedConfigId={setSelectedConfigId}
            runStatus={getRunStatus(selectedConfigId)}
            onRun={runConfig}
            onStop={updateStopConfig}
            onConfigsChanged={handleConfigsChanged} // Pass down
            configs={configs} // New: pass configs array
          />
        </div>
      </div>
    </div>
  );
};

export default App;
