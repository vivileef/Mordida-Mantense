export default function ConnectionStatus({ mode, connection, lastUpdated }) {
  const label =
    mode === "demo"
      ? "DEMOSTRACIÓN"
      : connection === "connected"
        ? "CONEXIÓN ESTABLE"
        : connection === "connecting"
          ? "CONECTANDO"
          : "SISTEMA DESCONECTADO";

  return (
    <div className={`connection connection--${connection}`}>
      <span className="connection__dot" />
      <span>{label}</span>
      {lastUpdated && <small>Última actualización: {lastUpdated.toLocaleTimeString("es-EC")}</small>}
    </div>
  );
}
