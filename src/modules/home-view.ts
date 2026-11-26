const plans = [
  {
    name: 'Básico',
    users: '1–3 usuarios',
    price: '$25',
    description: 'El orden esencial para comenzar a atender solicitudes.',
    features: [
      'Registro centralizado de solicitudes',
      'Seguimiento de estado y fecha límite',
      'Comentarios en cada ticket',
    ],
  },
  {
    name: 'Profesional',
    users: '5–10 usuarios',
    price: '$50',
    description: 'Coordinación clara para equipos de soporte en crecimiento.',
    popular: true,
    features: [
      'Todo lo incluido en Básico',
      'Cola compartida y asignación a agentes',
      'Gestión de prioridades y actividad',
    ],
  },
  {
    name: 'Empresarial',
    users: '20 usuarios o más',
    price: '$100',
    description: 'Control de acceso y seguimiento para equipos amplios.',
    features: [
      'Todo lo incluido en Profesional',
      'Roles de administrador, agente y solicitante',
      'Gestión centralizada de los tickets',
    ],
  },
];

export function renderHomeView() {
  return `
    <div class="landing">
      <header class="landing-nav">
        <a class="brand landing-brand" href="#/home" aria-label="Cenit, inicio"><span class="brand-mark">C</span><span>Cenit</span></a>
        <nav aria-label="Navegación del sitio">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#planes">Planes</a>
          <a class="button primary landing-login" href="#/login">Acceder</a>
        </nav>
      </header>
      <main>
        <section class="landing-hero">
          <div class="hero-copy">
            <p class="eyebrow">MESA DE AYUDA · VENDORS</p>
            <h1>El soporte de tu equipo, <span>en orden.</span></h1>
            <p class="hero-description">Cenit reúne solicitudes, responsables y avances en un mismo lugar para que cada necesidad tenga seguimiento hasta su resolución.</p>
            <div class="company-site">
              <p>Esta es una app de Vendors, S.A. Visita nuestro sitio web:</p>
              <a class="button secondary" href="https://www.vendedores.site/" target="_blank" rel="noopener noreferrer">Vendedores.site <span aria-hidden="true">↗</span></a>
            </div>
            <div class="hero-actions">
              <a class="button primary" href="#/login">Ingresar al sistema</a>
              <a class="button secondary" href="#como-funciona">Conocer cómo funciona</a>
            </div>
            <div class="hero-proof"><span class="proof-dot"></span> Solicitudes claras · Atención con seguimiento</div>
          </div>
          <div class="hero-preview" aria-label="Vista ilustrativa del seguimiento de una solicitud">
            <div class="preview-top"><span class="preview-window"><i></i><i></i><i></i></span><span>Panel de soporte</span><span class="preview-menu">•••</span></div>
            <div class="preview-title"><div><small>SOLICITUD · TK-0042</small><strong>Acceso a herramientas del equipo</strong></div><span class="badge status-progreso">En progreso</span></div>
            <div class="preview-progress"><span></span></div>
            <div class="preview-meta"><span><small>Asignado a</small><b><i class="preview-avatar">AM</i> Andrea M.</b></span><span><small>Prioridad</small><b><i class="priority-mark"></i> Normal</b></span></div>
            <div class="preview-activity"><span class="activity-line"></span><span class="activity-icon">✓</span><span><b>Solicitud recibida</b><small>El equipo ya puede darle seguimiento</small></span><time>Hoy</time></div>
            <div class="preview-note">Un solo lugar para ver qué se solicitó, quién lo atiende y cuál es el siguiente paso.</div>
          </div>
        </section>

        <section class="how-section" id="como-funciona">
          <div class="section-heading"><p class="eyebrow">SIMPLE PARA TODOS</p><h2>¿Cómo funciona Cenit?</h2><p>Del primer reporte a la resolución, cada paso queda visible para las personas involucradas.</p></div>
          <div class="steps-grid">
            <article class="step-card"><span class="step-number">01</span><div class="step-icon">＋</div><h3>Envía una solicitud</h3><p>Describe lo que necesitas y elige su categoría y prioridad desde el portal.</p></article>
            <article class="step-card"><span class="step-number">02</span><div class="step-icon">↗</div><h3>El equipo la organiza</h3><p>Agentes y responsables revisan la cola, asignan tickets y actualizan su estado.</p></article>
            <article class="step-card"><span class="step-number">03</span><div class="step-icon">✓</div><h3>Sigue el avance</h3><p>Consulta comentarios, fechas y cambios hasta que la solicitud quede resuelta.</p></article>
          </div>
        </section>

        <section class="plans-section" id="planes">
          <div class="section-heading"><p class="eyebrow">UNA OPCIÓN PARA CADA EQUIPO</p><h2>Planes Cenit</h2><p>Precios mensuales en USD, tomando como referencia los niveles y capacidades del flyer.</p></div>
          <div class="plans-grid">${plans.map((plan) => `
            <article class="plan-card ${plan.popular ? 'plan-popular' : ''}">
              ${plan.popular ? '<span class="popular-label">MÁS POPULAR</span>' : ''}
              <p class="plan-users">${plan.users}</p><h3>${plan.name}</h3>
              <p class="plan-description">${plan.description}</p>
              <div class="plan-price"><strong>${plan.price}</strong><span>/ mes</span></div>
              <ul>${plan.features.map((feature) => `<li><span>✓</span>${feature}</li>`).join('')}</ul>
              <a class="plan-link" href="#/login">Acceso para clientes <span>→</span></a>
            </article>`).join('')}</div>
          <p class="plans-note">Los planes se presentan con fines informativos. La contratación y la puesta en marcha se coordinan con Vendors, S.A.</p>
        </section>

        <section class="landing-cta">
          <div><p class="eyebrow">DA EL SIGUIENTE PASO</p><h2>Menos solicitudes perdidas. Más claridad para tu equipo.</h2></div>
          <a class="button light-button" href="#/login">Acceder a Cenit <span>→</span></a>
        </section>
      </main>
      <footer class="landing-footer" id="empresa"><a class="brand landing-brand" href="#/home"><span class="brand-mark">C</span><span>Cenit</span></a><span>Gestión de soporte para equipos.</span><strong>By Vendors, S.A.</strong></footer>
    </div>`;
}
