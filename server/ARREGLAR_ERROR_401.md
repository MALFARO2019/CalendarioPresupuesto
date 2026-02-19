# ✅ SOLUCIÓN PASO A PASO - Error 401 Forms

## El Problema
Tu sesión actual tiene un token JWT expirado. El servidor está rechazando las solicitudes porque el token no es válido.

## ⚠️ IMPORTANTE - Sigue estos pasos EXACTAMENTE:

### 1️⃣ Cerrar Sesión
1. En la esquina superior derecha de la aplicación, busca tu nombre de usuario o icono de perfil
2. Click en él
3. Selecciona **"Cerrar Sesión"** o **"Logout"**

### 2️⃣ Iniciar Sesión Nuevamente
1. En la página de login, ingresa tu email de administrador: **soporte@rostipolloscr.com**
2. Ingresa la clave: **R0st1p017**
3. Click en **"Iniciar Sesión"**

### 3️⃣ Ir al Panel de Forms
1. Una vez autenticado, click en el icono de **Configuración ⚙️** (Settings)
2. Click en el tab **"Forms"**
3. La página debería cargar CORRECTAMENTE ahora

## ✅ Cómo saber que funcionó
Deberías ver:
- **Tenant ID**: 70dff046e-e545-44c7-ae8c-21c53272ee6e
- **Client ID**: 44490c35-76d8-451c-a10f-05c526df8e38
- **Client Secret**: ••••••••••••••••
- **NO habrá errores 401 en la consola**
- El popup de error desaparecerá

## 🔍 Si aún no funciona
Si después de estos pasos sigue el error 401:
1. Abre la consola del navegador (F12)
2. Ve a la pestaña "Console"
3. Recarga la página (F5)
4. Copia TODOS los mensajes de error y compártelos conmigo

---

**Por qué sucede esto:**
Los tokens JWT expiran por seguridad. Al cerrar sesión e iniciar sesión, obtienes un token fresco y válido que permite acceder a todos los endpoints, incluyendo Forms.
