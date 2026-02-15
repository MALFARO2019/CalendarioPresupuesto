# Despliegue - Calendario de Presupuesto

## Instalación Inicial (Primera Vez)

### Pasos:

1. **Copiar toda la carpeta `CalendarioPresupuesto`** al servidor de aplicaciones
2. **Abrir PowerShell como Administrador** en el servidor
3. **Ejecutar:**

```powershell
cd C:\ruta\donde\copiaste\CalendarioPresupuesto\deploy
.\deploy.ps1
```

¡Eso es todo! El script hace todo automáticamente:
- ✅ Instala Node.js
- ✅ Instala NSSM
- ✅ Configura IIS + URL Rewrite + ARR
- ✅ Compila y despliega el frontend
- ✅ Despliega el backend
- ✅ Crea el servicio de Windows
- ✅ Configura el firewall
- ✅ Verifica que todo funcione

### Parámetros Opcionales

```powershell
# Cambiar el directorio de instalación (default: C:\Apps\CalendarioPresupuesto)
.\deploy.ps1 -InstallDir "D:\MiApp\CalendarioPresupuesto"

# Cambiar el puerto de IIS (default: 80)
.\deploy.ps1 -IISPort 8080
```

---

## Actualización (Cambios Posteriores)

```powershell
cd C:\ruta\donde\copiaste\CalendarioPresupuesto\deploy
.\update.ps1
```

### Solo frontend:
```powershell
.\update.ps1 -SkipBackend
```

### Solo backend:
```powershell
.\update.ps1 -SkipFrontend
```

---

## Post-Instalación

Después del primer despliegue, edite las credenciales de producción:

```powershell
notepad C:\Apps\CalendarioPresupuesto\server\.env
```

**Importante:** Cambie `DB_PASSWORD`, `JWT_SECRET` y `SMTP_PASS` por valores seguros.
