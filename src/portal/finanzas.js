// ─── Motor financiero ───────────────────────────────────────────────────────
// Reproduce las hojas 📈 PYG y 📦 Inventario del Excel de Control Financiero.
// Todo se calcula desde gastos + pauta_pagos + dropi_ordenes + parámetros
// mensuales, con las mismas reglas que descubrimos reconciliando el Excel:
//
//   · Ingresos, flete, devoluciones y pedidos entregados → de Dropi.
//   · Pauta del P&L = solo Meta Ads + TikTok Ads (no cuota de manejo ni wallet).
//   · Costos variables → gastos tipo "Costo Variable" EXCLUYENDO Importaciones
//     China (esas compras van a inventario, no al gasto del mes).
//   · Gastos fijos → gastos tipo "Costo Fijo".
//   · COGS → parámetro mensual; si falta, precio_proveedor de lo entregado.
//   · Inventario: inicial + compras (Importaciones China) − COGS = final,
//     encadenado mes a mes.
// ─────────────────────────────────────────────────────────────────────────

const N = (v) => Number(v) || 0
const mesDe = (fecha) => Number(String(fecha || '').slice(5, 7)) || 0
export const CAT_INVENTARIO = 'Importaciones China'

// Calcula los 12 meses del año. Devuelve un arreglo indexado 1..12 (0 vacío).
export function calcularPYG({ gastos = [], pauta = [], dropi = [], parametros = [], anio }) {
  const P = new Map()
  parametros.filter(p => p.anio === anio).forEach(p => P.set(p.mes, p))

  const meses = []
  let inventarioPrevio = P.get(1)?.inventario_inicial ?? 0

  for (let m = 1; m <= 12; m++) {
    const dm = dropi.filter(r => mesDe(r.fecha) === m)
    const entregados = dm.filter(r => r.estatus === 'ENTREGADO')
    const devueltas  = dm.filter(r => r.estatus === 'DEVOLUCION')
    const rechazadas = dm.filter(r => r.estatus === 'RECHAZADO')

    // Pedidos entregados = órdenes distintas (no líneas)
    const pedidos = new Set(entregados.map(r => r.orden_id)).size

    const ventaBruta = entregados.reduce((s, r) => s + N(r.total_linea), 0)
    const flete      = entregados.reduce((s, r) => s + N(r.precio_flete), 0)
    const comision   = N(P.get(m)?.comision_recaudo)
    const recaudoNeto = ventaBruta - flete - comision

    // COGS: parámetro mensual, o precio_proveedor de lo entregado si falta
    const cogsAuto = entregados.reduce((s, r) => s + N(r.precio_proveedor), 0)
    const cogsParam = P.get(m)?.cogs
    const cogs = (cogsParam === null || cogsParam === undefined) ? cogsAuto : N(cogsParam)
    const cogsEsAuto = (cogsParam === null || cogsParam === undefined)

    const utilidadBruta = recaudoNeto - cogs
    const margenBruto = ventaBruta ? utilidadBruta / ventaBruta : 0

    const costoDevoluciones = devueltas.reduce((s, r) => s + N(r.costo_devolucion_flete), 0)

    const gm = gastos.filter(r => mesDe(r.fecha) === m)
    const pm = pauta.filter(r => mesDe(r.fecha) === m)

    const meta   = pm.filter(r => r.plataforma === 'Meta Ads').reduce((s, r) => s + N(r.inversion), 0)
    const tiktok = pm.filter(r => r.plataforma === 'TikTok Ads').reduce((s, r) => s + N(r.inversion), 0)
    const totalPauta = meta + tiktok

    const margenContribucion = utilidadBruta - totalPauta
    const cpa  = pedidos ? totalPauta / pedidos : 0
    const roas = totalPauta ? ventaBruta / totalPauta : 0

    const costosVariables = gm
      .filter(r => r.tipo_gasto === 'Costo Variable' && r.categoria !== CAT_INVENTARIO)
      .reduce((s, r) => s + N(r.valor), 0)
    const gastosFijos = gm
      .filter(r => r.tipo_gasto === 'Costo Fijo')
      .reduce((s, r) => s + N(r.valor), 0)

    const utilidadNeta = margenContribucion - costosVariables - gastosFijos - costoDevoluciones
    const margenNeto = ventaBruta ? utilidadNeta / ventaBruta : 0

    // Inventario del mes
    const compras = gm
      .filter(r => r.categoria === CAT_INVENTARIO)
      .reduce((s, r) => s + N(r.valor), 0)
    const invInicialParam = P.get(m)?.inventario_inicial
    const inventarioInicial = (invInicialParam === null || invInicialParam === undefined)
      ? inventarioPrevio : N(invInicialParam)
    const inventarioFinal = inventarioInicial + compras - cogs
    inventarioPrevio = inventarioFinal

    const ticket = pedidos ? ventaBruta / pedidos : 0
    const tieneDatos = ventaBruta !== 0 || totalPauta !== 0 || gastosFijos !== 0 || costosVariables !== 0

    meses.push({
      mes: m, tieneDatos,
      pedidos, ventaBruta, flete, comision, recaudoNeto, ticket,
      cogs, cogsEsAuto, utilidadBruta, margenBruto,
      devueltas: devueltas.length, rechazadas: rechazadas.length, costoDevoluciones,
      meta, tiktok, totalPauta, cpa, roas, margenContribucion,
      costosVariables, gastosFijos, utilidadNeta, margenNeto,
      inventarioInicial, compras, inventarioFinal,
    })
  }
  return meses
}

export function totalizar(meses, campo) {
  return meses.reduce((s, m) => s + (m[campo] || 0), 0)
}
