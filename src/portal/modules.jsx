// ─── Catálogo de módulos del Portal DoralStore Control ──────────────────────
// Este archivo define TODO el menú lateral. Para agregar una pantalla nueva,
// añade un item aquí; la navegación se arma sola.
//
//   roles    → quién ve el módulo ('dueno' | 'admin' | 'logistica' | 'pauta')
//   render   → componente de la pantalla. Si es null, sale el placeholder.
//   fuente   → de dónde vendrán los datos (se muestra en el placeholder)
// ─────────────────────────────────────────────────────────────────────────

import FactucontrolApp from '../App.jsx'
import { embed } from './Embed.jsx'
import RegistroGastos from './screens/RegistroGastos.jsx'
import ImportarDatos from './screens/ImportarDatos.jsx'

// ── Iconos (SVG en línea, heredan color y tamaño) ──────────────────────────
const svg = (paths) => function Icon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths}
    </svg>
  )
}

export const Icons = {
  pauta:      svg(<><path d="M3 3v18h18"/><path d="M7 15l3-4 3 3 5-7"/></>),
  logistica:  svg(<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></>),
  admin:      svg(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10.6 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 16.11 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>),
  pedidos:    svg(<><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4"/><rect x="9" y="1" width="6" height="4" rx="1"/><path d="M8 12h8M8 16h5"/></>),
  guias:      svg(<><rect x="1" y="6" width="14" height="11" rx="1"/><path d="M15 10h4l3 3v4h-7z"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></>),
  novedades:  svg(<><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/></>),
  recoleccion:svg(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></>),
  devolucion: svg(<><path d="M3 8a9 9 0 1 1-.5 5"/><path d="M3 3v5h5"/></>),
  bodegas:    svg(<><path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-7h6v7"/></>),
  facturas:   svg(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></>),
  tarjetas:   svg(<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></>),
  lotes:      svg(<><path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5"/></>),
  gastos:     svg(<><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></>),
  usuarios:   svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></>),
  config:     svg(<><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/></>),
  salir:      svg(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></>),
}

// ── Estructura del menú ────────────────────────────────────────────────────
export const MODULES = [
  {
    key: 'pauta',
    label: 'Pauta',
    icon: Icons.pauta,
    roles: ['dueno', 'admin', 'pauta'],
    items: [
      {
        key: 'pauta-app',
        label: 'Panel de Pauta',
        icon: Icons.pauta,
        render: FactucontrolApp,   // app existente, sin cambios en su lógica
        fullBleed: true,           // trae su propio layout y barra lateral
      },
    ],
  },
  {
    key: 'logistica',
    label: 'Logística',
    icon: Icons.logistica,
    roles: ['dueno', 'admin', 'logistica'],
    // Estructura calcada de tu "Torre de Control · Logística".
    // Fuente: tabla dropi_ordenes (export de Dropi a nivel de línea de pedido).
    items: [
      // Tablero ya construido, embebido tal cual desde public/logistica/
      { key: 'log-torre',    label: 'Torre de Control',    icon: Icons.pauta,
        render: embed('/logistica/torre-de-control.html', 'Torre de Control') },
      { key: 'log-pedidos',  label: 'Órdenes por Entregar', icon: Icons.pedidos,    render: null, fuente: 'dropi_ordenes',
        descripcion: 'Seguimiento de lo que sigue en la calle: órdenes sin entregar, agrupadas por etiqueta de gestión, con descarga a CSV.' },
      { key: 'log-dinero',   label: 'Dinero y Flujo',      icon: Icons.gastos,      render: null, fuente: 'dropi_ordenes',
        descripcion: 'Facturación total vs recaudo cobrado, recaudo perdido por devoluciones, flete de entrega y costo de devoluciones por mes.' },
      { key: 'log-embudo',   label: 'Embudo de Entrega',   icon: Icons.recoleccion, render: null, fuente: 'dropi_ordenes',
        descripcion: 'Recorrido de la orden: generada → despachada → en reparto → entregada, con la fuga en cada paso y la tasa de despacho por mes.' },
      { key: 'log-transp',   label: 'Transportadoras',     icon: Icons.guias,       render: null, fuente: 'dropi_ordenes',
        descripcion: 'Rendimiento de Envía, Veloces, Interrapidísimo, Coordinadora, TCC y demás: efectividad frente a costo de flete. Incluye entregas en oficina vs domicilio.' },
      { key: 'log-novedades',label: 'Novedades',            icon: Icons.novedades,   render: null, fuente: 'dropi_ordenes',
        descripcion: 'Los 44 motivos de novedad, cuántas se solucionan y en cuánto tiempo. Más el tiempo de guía generada a entrega.' },
      { key: 'log-productos',label: 'Productos',            icon: Icons.bodegas,     render: null, fuente: 'dropi_ordenes',
        descripcion: 'Tasa de entrega por producto, para ver cuáles se devuelven más y cuánto cuesta esa devolución.' },
      { key: 'log-geo',      label: 'Geografía',            icon: Icons.devolucion,  render: null, fuente: 'dropi_ordenes',
        descripcion: 'Departamentos por volumen, ciudades donde más vendes y tus zonas rojas: dónde la entrega falla más.' },
      { key: 'log-detalle',  label: 'Detalle de Órdenes',   icon: Icons.facturas,    render: null, fuente: 'dropi_ordenes',
        descripcion: 'Tabla completa de órdenes con todos sus campos, filtros y exportación. La base para auditar cualquier número de arriba.' },
      // Carga diaria del reporte de Dropi (misma pantalla que en Administración)
      { key: 'log-importar', label: 'Cargar reporte Dropi', icon: Icons.recoleccion, render: ImportarDatos },
    ],
  },
  {
    key: 'admin',
    label: 'Administración',
    icon: Icons.admin,
    roles: ['dueno', 'admin'],
    items: [
      // Estructura calcada del Excel "CONTROL FINANCIERO 2026 · DORAL STORE".
      // Hojas de captura → tablas. Hojas de resumen → se calculan en la app.
      { key: 'adm-dashboard', label: 'Dashboard Financiero', icon: Icons.pauta, render: null, fuente: 'gastos + pauta_pagos',
        descripcion: 'Vista ejecutiva: gastos operativos, inversión en pauta, costo total de la empresa y pendientes por pagar.' },
      // Primera pantalla de captura real: formulario, tabla, edición y soporte adjunto.
      { key: 'adm-gastos',    label: 'Registro de Gastos', icon: Icons.facturas, render: RegistroGastos },
      { key: 'adm-pauta',     label: 'Registro de Pauta', icon: Icons.tarjetas, render: null, fuente: 'pauta_pagos · 828 registros',
        descripcion: 'Cada pago de Meta, TikTok, cuota de manejo y wallet Dropi, con cuenta publicitaria, ID de transacción y tarjeta usada.' },
      { key: 'adm-fijos',     label: 'Costos Fijos', icon: Icons.lotes, render: null, fuente: 'costos_fijos · 106 registros',
        descripcion: 'Base fija mensual por concepto y grupo: nómina, instalaciones, software, financieros. Con promedio mensual y mes más alto.' },
      { key: 'adm-fvsv',      label: 'Fijos vs Variables', icon: Icons.gastos, render: null, fuente: 'calculado sobre gastos',
        descripcion: 'Cuánto de tu costo es estructura y cuánto se mueve con la venta. Se calcula en vivo desde el tipo de cada gasto.' },
      { key: 'adm-pyg',       label: 'Pérdidas y Ganancias', icon: Icons.pedidos, render: null, fuente: 'calculado',
        descripcion: 'P&G mes a mes conectando venta, costo de producto, pauta, fijos y variables.' },
      { key: 'adm-inventario',label: 'Inventario', icon: Icons.bodegas, render: null, fuente: 'calculado',
        descripcion: 'Inventario valorizado: inicial, compras de importación y salidas por mes.' },
      { key: 'adm-catalogos', label: 'Catálogos', icon: Icons.config, render: null, fuente: 'catalogos · 103 valores',
        descripcion: 'Las listas maestras del Excel: categorías, bancos y tarjetas, estados, tipos de gasto, plataformas, cuentas publicitarias y productos.' },
      { key: 'adm-usuarios',  label: 'Usuarios y Roles', icon: Icons.usuarios, render: null, fuente: 'profiles',
        descripcion: 'Crear personas del equipo y asignarles rol: Dueño, Administrador, Logística o Pauta.' },
      // Carga de archivos: histórico del Excel y reporte diario de Dropi.
      { key: 'adm-importar',  label: 'Importar datos', icon: Icons.recoleccion, render: ImportarDatos },
    ],
  },
]

export const ROLE_LABEL = {
  dueno: 'Dueño',
  admin: 'Administrador',
  logistica: 'Logística',
  pauta: 'Pauta',
}

export function modulesForRole(role) {
  return MODULES
    .filter(m => m.roles.includes(role))
    .map(m => ({ ...m, items: m.items }))
}
