export default function ConnectionStatus({ mode, connection, lastUpdated }) {
  const label = mode === 'demo' ? 'DEMO · DATOS SIMULADOS' : connection === 'connected' ? 'API CONECTADA' : connection === 'connecting' ? 'CONECTANDO' : 'API DESCONECTADA';
  return (
    <div className={`connection connection--${connection}`}>
      <span className="connection__dot" />
      <span>{label}</span>
      {lastUpdated && <small>{lastUpdated.toLocaleTimeString('es-EC')}</small>}
    </div>
  );
}
