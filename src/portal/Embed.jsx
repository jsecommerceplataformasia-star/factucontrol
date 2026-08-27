import { useState } from 'react'

// ─── Embed ──────────────────────────────────────────────────────────────────
// Monta un tablero HTML autónomo (los que ya están construidos aparte) dentro
// del Portal, sin reescribirlos. El archivo vive en public/ y se sirve como
// estático; Vercel revisa el sistema de archivos antes de aplicar el rewrite
// a index.html, así que la ruta funciona en producción.
//
// Uso desde modules.jsx:
//   render: embed('/logistica/torre-de-control.html', 'Torre de Control')
// ─────────────────────────────────────────────────────────────────────────

export function Embed({ src, titulo }) {
  const [cargando, setCargando] = useState(true)

  return (
    <div style={{ position:'relative', width:'100%', height:'100vh', background:'#0E1420' }}>
      {cargando && (
        <div style={{
          position:'absolute', inset:0, display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center', gap:14,
          background:'#0E1420', color:'#8497AE', fontFamily:"'DM Sans',sans-serif", fontSize:13,
        }}>
          <style>{`@keyframes embed-spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{
            width:26, height:26, borderRadius:'50%',
            border:'2px solid rgba(58,214,196,0.15)', borderTopColor:'#3AD6C4',
            animation:'embed-spin .7s linear infinite',
          }} />
          Cargando {titulo}…
        </div>
      )}
      <iframe
        src={src}
        title={titulo}
        onLoad={() => setCargando(false)}
        style={{ width:'100%', height:'100%', border:'none', display:'block' }}
      />
    </div>
  )
}

// Ayuda para declarar un embed en una sola línea dentro de modules.jsx
export const embed = (src, titulo) => function Embebido() {
  return <Embed src={src} titulo={titulo} />
}
