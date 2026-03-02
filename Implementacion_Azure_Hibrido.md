# Plan de Implementación: Servidor Híbrido (Azure + On-Premise)

## 1. Visión General de la Arquitectura
El objetivo es implementar un patrón de **Separación de Responsabilidades de Comandos y Consultas (CQRS)** a nivel de conexión:
- **Lecturas (Consultas / SELECTs):** Se dirigen a la base de datos en Azure SQL. Esto permite que la carga pesada de reportes y cálculos (como presupuestos) se procese en la nube con alta disponibilidad y escalabilidad, sin saturar el servidor local.
- **Escrituras (Comandos / INSERT, UPDATE, DELETE):** Se dirigen a la base de datos On-Premise (local). Esto asegura que el servidor de la oficina siga siendo la "fuente única de la verdad" para las transacciones.

## 2. ¿Es posible actualizar datos en tiempo real?
**SÍ, TOTALMENTE.** Para que las lecturas en Azure reflejen inmediatamente lo que se escribe en On-Premise, se debe establecer un mecanismo de replicación nativo de SQL Server. Las dos opciones principales son:

### Opción A: Replicación Transaccional (Recomendada para Tiempo Real)
- **Cómo funciona:** El servidor de SQL Server On-Premise actúa como *Publicador* y envía cada transacción casi de manera instantánea a la base de datos de Azure SQL (que actúa como *Suscriptor*).
- **Latencia:** Sub-segundos (tiempo real real). Tan pronto haces el `INSERT` local, Microsoft SQL se encarga de enviarlo a la nube por debajo.
- **Esfuerzo:** Se configura directo en tu SQL Server Management Studio (SSMS).

### Opción B: Azure SQL Data Sync
- **Cómo funciona:** Un servicio de Azure (con un agente instalado en tu servidor local) que sincroniza tablas que tú elijas.
- **Latencia:** Puede tener un ligero retraso (segundos) comparado con la opción A, pero es visualmente más fácil de administrar desde el portal de Azure. 

## 3. Cambios Necesarios en el Código de la App

### 3.1. En el Backend (Node.js)
Actualmente nuestra App utiliza una sola conexión a la base de datos. Debemos modificar esto:
1. **Doble Pool de Conexiones:** Crear `poolLectura` (Azure) y `poolEscritura` (On-Premise) en el backend (por ejemplo en tu archivo `db.js` o equivalente).
2. **Enrutador de Querys:**
   - Si tu app lanza un `SELECT`, el sistema lo tira contra Azure.
   - Si tu app lanza un `UPDATE/INSERT/DELETE` (o un Procedimiento Almacenado que modifica datos), el sistema lo tira contra el On-Premise.
3. **Modos:** Crear un switch (variable) que si está en `Directo`, todo usa On-Premise. Si está en `Azure Hybrid`, se activa la separación de conexiones.

### 3.2. En el Frontend (La UI que me compartiste)
1. **Crear Componente de Configuración:** Debemos maquetar la interfaz de `Conexión Principal` tal cual tu referencia.
2. **Guardado Seguro:** Esas credenciales y configuración deben guardarse de forma segura, preferiblemente inyectándose de nuevo al archivo `.env` del servidor o a un archivo JSON encriptado de configuración general.
3. **Reinicio Dinámico:** Como la nota en tu alerta en la imagen bien lo señala: *Cambiar el modo requiere reiniciar el servidor*. Implementar un endpoint que mate y reinicie el backend automáticamente cuando guardes esta configuración usando herramientas como `pm2` o comandos directos de node.

## 4. Consideraciones a Tener en Cuenta
- **Procedimientos Almacenados Mixtos:** Si tenemos un Stored Procedure que *modifica* una tabla y luego hace un `SELECT` enorme para devolver el nuevo estado en un solo paso, este tendrá que correr entero en el On-Premise (porque Azure es solo lectura). A futuro, se podrían partir en dos acciones (Node hace el execute del cambio local y luego un timeout mínimo y hace el Select de Azure).
- **Red:** El servidor local debe tener una conexión estable de subida, para que la replicación no se atore.

---
**Flujo Híbrido Final:**
1. Tu usuario local aprueba un presupuesto en la Web.
2. Node.js lo guarda en **On-Premise**.
3. SQL Server replica eso por un túnel a **Azure** en ~100 milisegundos.
4. El teléfono del Jefe cargando el reporte en la calle, lee el dato nuevecito sacándolo desde **Azure** sin siquiera tocar tu internet local.
