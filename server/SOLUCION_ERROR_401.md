# ❌ Solución para Error 401 (Unauthorized)

## 🔍 Problema Identificado

Los endpoints de Forms están correctamente configurados en el servidor, pero tu sesión necesita un token JWT válido.

## ✅ Solución Rápida

### Paso 1: Cerrar Sesión
1. Click en tu nombre de usuario (esquina superior derecha)
2. Selecciona "Cerrar Sesión"

### Paso 2: Iniciar Sesión Nuevamente  
1. Ingresa tu usuario administrador
2. Ingresa tu contraseña
3. Click en "Iniciar Sesión"

### Paso 3: Navegar a Forms
1. Ve a Panel de Configuración (icono ⚙️)
2. Click en el tab "Forms"
3. La página ahora debería cargar correctamente

## 🔐 Lo que está pasando

Los endpoints de Forms requieren:
- ✅ Usuario autenticado
- ✅ Permisos de administrador
- ✅ Token JWT válido

Tu navegador tiene un token expirado o inválido. Al cerrar sesión e iniciar sesión nuevamente, obtendrás un token fresco que funcionará con todos los endpoints.

## 📊 Confirmación de que funcionó

Después de iniciar sesión e ir al tab Forms, deberías ver:
- **Tenant ID**: 70dff046e-e545-44c7-ae8c-21c53272ee6e
- **Client ID**: 44490c35-76d8-451c-a10f-05c526df8e38
- **Client Secret**: ••••••••••••••••
- **Sin errores 401 en la consola**

## 🆘 Si el problema persiste

1. Abre la consola del navegador (F12)
2. Ve a la pestaña "Console"
3. Ejecuta: `localStorage.getItem('token')`
4. Si dice `null`, necesitas iniciar sesión
5. Si muestra un token, copia el error completo y compártelo

---

**Nota**: Este es un comportamiento normal de seguridad JWT. Los tokens expiran después de cierto tiempo para proteger tu aplicación.
