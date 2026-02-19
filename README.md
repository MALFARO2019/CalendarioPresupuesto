# KPIs Rosti

Plataforma modular de análisis de KPIs para restaurantes Rosti, incluyendo:
- **Alcance de Presupuesto**: Análisis mensual, anual y tendencias
1. **server**: Backend en Node.js/Express.
2. **web-app**: Frontend en React/Vite.

## Prerrequisitos

- Node.js instalado (v18+ recomendado).
- SQL Server asegurado que esté corriendo (para el backend).

## Instrucciones de Ejecución

Debes abrir **dos terminales** diferentes.

### Terminal 1: Backend (Server)

1. Navega a la carpeta `server`:
   ```bash
   cd server
   ```
2. Instala las dependencias (solo la primera vez):
   ```bash
   npm install
   ```
3. Verifica el archivo `.env` para la configuración de la base de datos (si aplica).
4. Inicia el servidor:
   ```bash
   npm start
   ```
   El servidor correrá en `http://localhost:3000`.

### Terminal 2: Frontend (Web App)

1. Navega a la carpeta `web-app`:
   ```bash
   cd web-app
   ```
2. Instala las dependencias (solo la primera vez):
   ```bash
   npm install
   ```
3. Inicia la aplicación en modo desarrollo:
   ```bash
   npm run dev
   ```
   La aplicación correrá usualmente en `http://localhost:5173`.

## Notas Importantes

- Actualmente, el frontend (`web-app`) está utilizando datos de prueba (`mockData`) y no está conectado directamente al backend para mostrar datos reales en los componentes visuales principales.
- El backend (`server`) expone un endpoint `/api/budget` que consulta la base de datos.
