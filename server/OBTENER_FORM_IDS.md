# 📋 Cómo Obtener Form IDs de Microsoft Forms

## Método 1: Desde la URL del Formulario

### Paso 1: Acceder a Microsoft Forms
1. Ve a [https://forms.office.com](https://forms.office.com)
2. Inicia sesión con tu cuenta de Microsoft 365

### Paso 2: Abrir el Formulario
1. En la lista de formularios, haz clic en el formulario que quieres sincronizar
2. Esto abrirá el formulario en modo de edición

### Paso 3: Copiar el Form ID de la URL

La URL tendrá uno de estos formatos:

**Formato 1 - Edición:**
```
https://forms.office.com/Pages/DesignPageV2.aspx?FormId=AQUI_ESTA_EL_FORM_ID&...
```

**Formato 2 - Vista previa:**
```
https://forms.office.com/r/AQUI_ESTA_EL_FORM_ID
```

**Ejemplo Real:**
```
https://forms.office.com/Pages/DesignPageV2.aspx?FormId=v4j5cvGGr0GRqy180BHbR8zjm8K3lQ1Nlv5mKFqW8StUMVNTRVI...
```
↓
**Form ID:** `v4j5cvGGr0GRqy180BHbR8zjm8K3lQ1Nlv5mKFqW8StUMVNTRVI...`

### Paso 4: Copiar el ID
- Selecciona el ID completo desde la URL
- Copia el texto (Ctrl+C)

---

## Método 2: Desde la API de Microsoft Forms

Si tienes muchos formularios, puedes listarlos con este endpoint:

```
GET https://graph.microsoft.com/v1.0/me/drive/special/approot:/Apps/Microsoft%20Forms
```

---

## Configurar en la Aplicación

### Formulario Único
Si solo tienes un formulario:
```
abc123xyz456
```

### Múltiples Formularios
Separa los IDs con comas:
```
abc123xyz456, def789uvw012, ghi345rst678
```

---

## Ejemplo Completo

**Form IDs para configurar:**
```
v4j5cvGGr0GRqy180BHbR8zjm8K3lQ1Nlv5mKFqW8StUM,
k2m9bvFFp1HSpx290CHcS9akn9L4mR2Omw6nLGrX9TuVN,
w8p3dvHHs2JTsz410EJeU0clo0M5oT3Pox7oMHsY0UvXO
```

---

## 💡 Tips

1. **IDs Largos**: Los Form IDs pueden ser muy largos (50-100 caracteres)
2. **Sin Espacios**: Asegúrate de no copiar espacios al inicio o final
3. **Case Sensitive**: Los IDs distinguen entre mayúsculas y minúsculas
4. **Validación**: La aplicación validará la conexión cuando guardes

---

## ✅ Verificar que funcionó

Después de configurar:
1. Click en "Probar Conexión" → Debe mostrar ✅
2. Ejecuta "Sincronización Completa"
3. Revisa la tabla de historial
4. Verifica que aparezcan registros en SQL Server

---

## 🔧 Troubleshooting

**Error: "Form not found"**
- Verifica que el Form ID sea correcto
- Confirma que tu cuenta tenga acceso al formulario

**Error: "Authentication failed"**
- Verifica las credenciales Azure AD
- Confirma que los permisos estén otorgados

**Sin respuestas sincronizadas**
- Verifica que el formulario tenga respuestas
- Revisa los logs de sincronización en la tabla
