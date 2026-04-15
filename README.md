# FactuControl

Control de facturación y retiros para pauta publicitaria Meta Ads + TikTok Ads.

## Despliegue en Vercel (5 minutos)

### 1. Subir a GitHub
```bash
git init
git add .
git commit -m "FactuControl v1"
git remote add origin https://github.com/TU_USUARIO/factucontrol.git
git push -u origin main
```

### 2. Conectar a Vercel
1. Ve a [vercel.com](https://vercel.com) e inicia sesión
2. Click "Add New Project"
3. Importa tu repo de GitHub
4. En **Environment Variables** agrega:
   - `VITE_SUPABASE_URL` = `https://bgosigbbfukzmqxayixc.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (el valor del archivo .env)
5. Click "Deploy"

### 3. Crear tu usuario
1. Abre tu URL de Vercel (ej: factucontrol.vercel.app)
2. Click "Regístrate"
3. Ingresa tu email y contraseña
4. Listo — ya puedes usar la app

## Variables de entorno
```
VITE_SUPABASE_URL=https://bgosigbbfukzmqxayixc.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
