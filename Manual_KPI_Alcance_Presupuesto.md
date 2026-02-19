# Manual de Usuario — KPIs Rosti: Alcance Presupuesto

**Versión:** 2026 | **Plataforma:** Web (PC y Móvil)

---

## Acceso al Sistema

Ingrese a la URL de la aplicación. Introduzca su **correo electrónico** y **contraseña** y presione **Iniciar Sesión**.

> Si olvidó su contraseña, use el enlace "¿Olvidaste tu contraseña?" en la pantalla de inicio.

---

## Navegación Principal

La barra superior contiene las pestañas de navegación:

| Pestaña | Descripción |
|---|---|
| 🏠 **Inicio** | Panel de resumen general (Dashboard) |
| 📅 **Mensual** | Calendario diario del mes seleccionado |
| 📊 **Anual** | Vista anual con comparativo mensual |
| 📈 **Tendencia** | Evaluación por restaurante vs presupuesto |
| 🗓️ **Rangos** | Análisis por rango de fechas personalizado |

---

## Filtros Comunes

Disponibles en las vistas Mensual, Anual y Rangos:

- **Local / Grupo:** Seleccione un restaurante individual o un grupo (ej. Corporativo).
- **Canal:** Filtre por canal de venta (Todos, Salón, Llevar, Express, UberEats, etc.).
- **KPI:** Elija la métrica a analizar: **Ventas**, **Transacciones** o **TQP** (Tiquete Promedio).
- **Tipo Año:** Compare contra *Año Anterior* o *Año Anterior Ajustado*.

---

## Vista Mensual

Muestra un **calendario diario** del mes con el desempeño de cada día.

### Cómo leer cada celda del calendario

Cada día muestra tres valores:
1. **Presupuesto** — monto planificado para ese día
2. **Real** — monto ejecutado ese día
3. **Alcance %** — porcentaje de cumplimiento (Real / Presupuesto × 100)

### Código de colores del Alcance

| Color | Significado |
|---|---|
| 🟢 **Verde** | Alcance ≥ 100% — Meta cumplida |
| 🟠 **Naranja** | Alcance entre 90% y 99% — Cerca de la meta |
| 🔴 **Rojo** | Alcance < 90% — Por debajo de la meta |

### Tarjeta de Resumen (parte superior)

Aparece encima del calendario y muestra un resumen comparativo con dos tablas:

**Tabla izquierda — vs Presupuesto:**

| Fila | Descripción |
|---|---|
| P. Mes | Presupuesto total del mes |
| P. Acum | Presupuesto acumulado hasta la fecha con datos |
| Real | Ventas/transacciones reales acumuladas |
| Dif. Acum | Diferencia entre Real y P. Acum |
| **Alcance** | **Real ÷ P. Acum × 100** (indicador principal) |
| Saldo | Monto pendiente para alcanzar el presupuesto |

**Tabla derecha — vs Año Anterior:**
Misma estructura pero comparando contra el mismo período del año anterior.

---

## Vista Anual

Muestra el desempeño **mes a mes** durante el año seleccionado.

- Cada fila representa un mes con: Presupuesto, P. Acumulado, Real, Alcance %.
- La fila **TOTAL** al final suma todos los meses con datos.
- Incluye la misma **Tarjeta de Resumen** que la vista Mensual pero en modo anual.

---

## Vista Tendencia

Permite evaluar el alcance de **todos los restaurantes** en un período.

### Filtros adicionales en Tendencia

- **Local:** Seleccione "Corporativo" para ver todos los restaurantes, o un grupo/local específico.
- **Canal:** Filtre por canal de venta.
- **Tipo Año:** Natural o Ajustado.

### Tarjeta de Resumen Total

Muestra 6 métricas en una barra horizontal:

| Métrica | Descripción |
|---|---|
| Presupuesto | Total presupuestado en el período |
| P. Acumulado | Presupuesto acumulado con datos reales |
| Real | Total ejecutado |
| % Ppto | Alcance vs presupuesto (con flecha de tendencia) |
| Año Anterior | Total del mismo período año anterior |
| % Ant. | Crecimiento vs año anterior |

### Pestañas de la Vista Tendencia

| Pestaña | Contenido |
|---|---|
| **Evaluación** | Tabla con todos los restaurantes ordenable por cualquier columna |
| **Resumen Canal** | Desglose por canal de venta con contribución % |
| **Top 5** | Los 5 mejores y 5 peores restaurantes por % Presupuesto |

### Columnas de la tabla Evaluación

| Columna | Descripción |
|---|---|
| Restaurante | Nombre del local |
| Presupuesto | Presupuesto total del período |
| P. Acumulado | Presupuesto acumulado con datos |
| Real | Ventas/transacciones reales |
| % Ppto | Alcance vs presupuesto (badge de color) |
| Año Anterior | Valor del mismo período año anterior |
| % Ant. | Crecimiento vs año anterior |

> **Tip:** Haga clic en el encabezado de cualquier columna para ordenar la tabla.

---

## Vista Rangos

Permite analizar el desempeño en **cualquier rango de fechas personalizado**.

### Configuración del Rango

1. Use el **selector de fechas** para definir fecha inicio y fecha fin.
2. Seleccione el **agrupamiento**: Día, Semana, Quincena o Mes.

### Gráfico Interactivo

Muestra barras con Real vs Presupuesto por período. Puede **arrastrar el selector** en el gráfico para filtrar el rango de fechas directamente.

### Pestañas de la Vista Rangos

| Pestaña | Contenido |
|---|---|
| **📋 Evaluación** | Tabla de períodos con Presupuesto, Real, % Alcance, Año Anterior |
| **📊 Resumen Canal** | Desglose por canal con % crecimiento y contribución |
| **🏆 Top 5** | Los 5 mejores y 5 peores períodos por % Alcance |

---

## Exportar Reportes

Haga clic en el ícono **⬇ Descargar** en la barra superior:

- **Descargar PDF** — Imprime la vista actual.
- **Exportar Excel** — Descarga los datos en formato .xlsx.
- **Enviar por Correo** — Envía el reporte al correo indicado.

---

## Preferencias de Usuario

Haga clic en el ícono **⚙ Preferencias** (sliders) en la barra superior:

| Preferencia | Opciones |
|---|---|
| Formato de Porcentajes | Base 100 (ej. 105%) o Diferencial (ej. +5%) |
| Decimales en Porcentajes | 0, 1, 2 o 3 decimales |
| Decimales en Valores | 0, 1, 2 o 3 decimales |
| Formato de Valores | Completo, Miles (K) o Millones (M) |
| Tipo Año Predeterminado | Año Anterior o Año Anterior Ajustado |

---

## Indicador de Conexión

En la barra superior aparece un indicador de estado de la base de datos:

| Indicador | Significado |
|---|---|
| 🟢 **SQL P** | Conectado a base de datos principal |
| 🟡 **SQL S** | Conectado a base de datos secundaria |
| 🔴 **Mock** | Sin conexión — usando datos de prueba |

---

## Preguntas Frecuentes

**¿Por qué el Alcance del mes no llega al 100% aunque las ventas van bien?**
El Alcance se calcula contra el **Presupuesto Acumulado** (solo días con datos reales), no contra el presupuesto total del mes. Esto es normal si aún quedan días del mes por ejecutar.

**¿Qué diferencia hay entre "Año Anterior" y "Año Anterior Ajustado"?**
El Año Anterior Ajustado aplica un factor de corrección por diferencias en el calendario (días hábiles, feriados, etc.) para hacer la comparación más justa.

**¿Puedo ver datos de un restaurante específico?**
Sí. En el filtro **Local**, seleccione el restaurante deseado. Si selecciona un grupo (ej. Corporativo), verá el consolidado de todos los locales del grupo.

**¿Con qué frecuencia se actualizan los datos?**
Los datos se actualizan automáticamente desde la fuente de datos configurada. La fecha límite de datos disponibles se muestra en la tarjeta de resumen.

---

*Manual preparado para publicación en SharePoint — KPIs Rosti 2026*
