import React, { useEffect, useRef, useState } from 'react';
import ConfigList from './ConfigList';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

const App = () => {
  const [loaded, setLoaded] = useState(false);
  const [placeholder, setPlaceholder] = useState("Loading");
  const [messages, setMessages] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    // Prevent multiple connections
    if (wsRef.current) return;

    const ws = new WebSocket('ws://127.0.0.1:8000/ws/kmengine/');
    wsRef.current = ws;

    ws.onopen = () => {
      setLoaded(true);
      setPlaceholder("Connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessages(prev => [...prev, data]);
      } catch (e) {
        setMessages(prev => [...prev, { error: "Invalid JSON", raw: event.data }]);
      }
    };

    ws.onerror = () => {
      setPlaceholder("WebSocket error");
    };

    ws.onclose = () => {
      setPlaceholder("WebSocket closed");
    };

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return (
    <div className="container-fluid vh-100">
      <div className="row h-100">
        <div className="col-12 col-md-3 col-lg-2 p-0 border-end bg-light">
          <ConfigList ws={wsRef.current}/>
        </div>
        <div className="col p-4">
          <h1 className="mb-3">WebSocket Messages</h1>
          <div className="mb-2">
            <span className={`badge ${loaded ? 'bg-success' : 'bg-secondary'}`}>
              {loaded ? "Connected" : placeholder}
            </span>
          </div>
          <ul className="list-unstyled">
            {messages.map((msg, idx) => (
              <li key={idx} className="mb-3">
                <pre className="app-json-pre">{JSON.stringify(msg, null, 2)}</pre>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default App;
