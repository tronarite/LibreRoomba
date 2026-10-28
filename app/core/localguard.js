// Protección de un servidor sin autenticación que escucha en local: evita que una web abierta en el navegador (DNS rebinding o peticiones
// entre orígenes) mande órdenes al robot. Se comprueba la cabecera Host (solo nombres propios) y, si viene, Origin (debe ser el mismo host).
function hostname(hostHeader) {
  try { return new URL(`http://${hostHeader}`).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch (_) { return null; }
}

function createGuard({ host = '127.0.0.1', extraHosts = [] } = {}) {
  const allowed = new Set(['localhost', '127.0.0.1', '::1', ...extraHosts.map((h) => h.trim().toLowerCase()).filter(Boolean)]);
  if (host && host !== '0.0.0.0' && host !== '::') allowed.add(host.toLowerCase());

  // devuelve null si la petición es aceptable, o el motivo del rechazo
  function check(headers) {
    const name = hostname(headers.host || '');
    if (!name || !allowed.has(name)) return 'Host no permitido';
    if (headers.origin !== undefined) {
      let origin;
      try { origin = new URL(headers.origin); } catch (_) { return 'Origen no permitido'; }
      if (origin.host.toLowerCase() !== String(headers.host).toLowerCase()) return 'Origen no permitido';
    }
    return null;
  }

  const middleware = (req, res, next) => {
    const reason = check(req.headers);
    if (reason) return res.status(403).json({ error: reason });
    next();
  };
  return { check, middleware };
}

module.exports = { createGuard };
