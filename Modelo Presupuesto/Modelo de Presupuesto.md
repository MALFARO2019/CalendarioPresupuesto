Crea un módulo nuevo en la configuración de KpisRosti en la seccion de sistema y llamalo Modelo de Presupuesto

Dame un diseño de modulo y vistas, y un plan de implementación, como la tabla destino debe estar siempre en producción debe quedar claro cual tabla estoy usando para hacer pruebas, asi que debo facilmente poder pasar de la tabla de producción a test RSM_ALCANCE_DIARIO y RSM_ALCANCE_DIARIO_TEST, has todas las preguntas que necesites para tu diseño

El presupuesto tiene un Nombre: Presupuesto 2026
Por lo tanto debe solo modificar estos datos en la tabla destino, ya que con el tiempo habran otros presupuestos

Cuando cambie de año será Presupuesto 2027, y si no tengo datos reales se usaran datos de referencia

Version de modelo:
Cada ejecución debe guardar una tabla de version como sufijo, mas adelante explico que se ocupa una vista que permita restaurar una version, solo 15 versiones

Objetivo:
Crear un presupuesto 2026 que permita a la empresa determinar su comportamiento de ventas
El modelo se debe calcular cada día a una hora configurable en este modulo

Módulo del presupuesto
Acá vas a agregar una opción para administrar los eventos que se describen adelante, además poder definir la tabla en que se generar el modelo por omisión RSM_ALCANCE_DIARIO.
Una opción para poder agregar registros a la tabla KpisRosti_Consolidado_Mensual ojala tipo cuadricula que admita copy/paste de valores
Una vista de ajuste del presupuesto
Vista para las referencias cuando no existe real aplicado al modelo por ejemplo los locales nuevos que no tienen peso de por que no tienen ventas el año anteiror, o cuando corra el modelo 2027 a final de año y diciembre no este terminado debere usar el peso de diciembre del año anterior.

Reglas: Cuando se creen, modifiquen o borren eventos el presupuesto debe calcularse, al igual si algún valor de la tabla KpisRosti_Consolidado_Mensual

Vista par restaurar versiones anteriores

Cálculo del presupuesto
Necesito montar el presupuesto diario 2026 para una cadena de restaurantes, tengo la tabla KpisRosti_Consolidado_Mensual en la base de datos [RP_BI_RESUMENES] servidor 10.29.1.14 el presupuesto mensual NO detallado por día, observa que existen canales en columnas como SALON,	LLEVAR,	AUTO,	EXPRESS, ECOMMERCE,	UBEREATS y TOTAL (TOTAL que es la sumatoria de los otros canales). 

Necesito montar el presupuesto diario del 2026, teniendo en cuenta las siguientes consideraciones

El presupuesto debe contemplar que el desplazamiento de los días de la semana por ejemplo el viernes 20 de marzo 2026 su equivalente debe ser viernes 21 de marzo 2025

Existen fechas que no se pueden desplazar como el día de la madre, es decir el presupuesto debe contemplar que la participación del 15 de agosto del 2026 debe ser igual al 15 de agosto del 2025, estas excepciones deben estar registradas en la tabla DIM_EVENTOS_FECHAS y DIM_EVENTOS que es el encabezado

Existen fechas como las de viernes negro que cambian cada año que también estarán en estas tablas
		
 Es importante que tomes en cuenta que el presupuesto mensual debe cumplirse lo más ajustado posible

Es muy importante que tomes en cuenta que el tiquete promedio es la división de Ventas entre Transacciones, que el presupuesto de transacciones siempre debe ser números enteros

 Los tipos son:  "Transacciones", "Ventas" y "TQP" (tiquete promedio que es Ventas / Transacciones), respetando la mayúscula inicial. 


. Agrega un canal que se debe llamar "Todos" y que corresponde a la sumatoria de todos los demás canales. 

Los canales salientes deben ser los siguientes AutoPollo, ECommerce, Express, Llevar, Salón, UberEats y Todos que es la sumatoria de todos los demás canales. 

El campo día corresponde al número de día del mes, el campo iddia corresponde al día de la semana donde 1 es lunes. 

Locales nuevos / faltantes de participación Si faltan participaciones 2025 por aperturas: 
Mall San Pedro (S84) usa la participación de Lincoln (S32)
Multicentro (S85) usa la participación de Desamparados (S04)
San Isidro (V26) usa la participación de Ventanita Sabanilla (V01)
Crea tabla de ser necesario, y aunque los datos actuales no lo necesitan ten presente que se pueden definir por canal

El presupuesto es por local, pero existen agrupaciones de locales por codalmacen, y necesito el presupuesto de las agrupaciones por día, por canal, usando la sumatoria de cada local, usa para esto la tabla grupo de almacén y grupo almacén lin cuando idvisibe sea 20, debes crear la serie, codalmacen (usa por ejemplo G01 cuando el idgrupo es 3001, G00 cuando el id de grupo es 3000) y idlocal usando un id diferente, y usa la descripción del grupo para el campo local. 

Garantiza que no se dupliquen registros para cada día, local, canal. La única tabla a modificar es la de RSM_ALCANCE_DIARIO

Valida bien los campos de las tablas y evita duplicados

Incluye una validación de las sumatorias de la tabla Consolidado contra el resultado, obviamente de los codalmacenes en común para garantizar la integridad

Cálculo y Comparativo
El modelo debe calcularse todos los días de manera automática, de preferencia con un job de base de datos ya que los datos reales vienen de la tabla BI_VENTAS_ROSTIPOLLOS, y no pueden contener datos del día presente solo de día anterior cerrado, porque no maneja horas

• Ventas y Transacciones son base.
• TQP siempre derivado.
• Transacciones entero siempre.

13) Vista de carga de KpisRosti_Consolidado_Mensual
Cuando dices cuadrícula con copy/paste:
	• ¿Debe editar solo 2026? Año del modelo en revision
	• ¿Se edita por:
		○ local + mes
		○ y columnas de canal/tipo? todo
	• ¿Quieres validaciones en línea (sumas, tipos, negativos, null)? si


14) Vista de ajustes: alcance exacto de edición
Mencionas:
	• “usuario solo puede ajustar un restaurante y mes a la vez”
	• pero también “canal o canales”
Necesito confirmar:
	• ¿Puede seleccionar múltiples canales y moverlos a la vez? si
	• ¿O solo 1 canal por vez? no
	• ¿Se puede ajustar Todos directamente o solo canales base? si

15) Gráfico anual visible pero no editable
Esto está claro conceptualmente.
Solo confirmar:
	• ¿El gráfico anual muestra el mismo local y canal seleccionados? si
	• ¿El bloqueo de edición aplica solo por UI, o también validado en backend? si
(Debería ser ambos.)

16) Bitácora de ajustes
Quisiera confirmar campos mínimos de auditoría:
	• Usuario
	• FechaHora
	• Local
	• Mes
	• Canal
	• Tipo
	• Valor anterior
	• Valor nuevo
	• Motivo/comentario (¿obligatorio?)
	• Origen (manual / recálculo / restore versión)

17) Seguridad / permisos  Agregar todo a un modulo de Modelo en perfil y usuario, que se pueda administrar por perfil
¿Quién puede hacer cada cosa?
	• Administrar eventos
	• Editar consolidado mensual
	• Ejecutar recálculo manual
	• Ajustar curva 
	• Restaurar versiones
	
18) FLOAT vs DECIMAL
Tus tablas usan float.
No es una duda funcional, pero sí una decisión importante:
	• Para montos y TQP, float puede meter diferencias de precisión.
	• Recomiendo decimal(18,4) o similar en cálculos internos.
Modifica la tabla de ser necesario

20) Campos “Llave_*” marcados para eliminar
En la estructura pones:
	• Llave_Presupuesto (eliminar)
	• Llave_AñoAnterior (eliminar)
	• Llave_AnoAnterior_Ajustado (eliminar)
Borrarlos

21) Corte de datos reales (MontoReal)
Mencionas que no deben incluir día actual porque no maneja horas.
Necesito fijar la regla exacta:
	• ¿Siempre FECHA < CAST(GETDATE() AS date)?
	• ¿Qué pasa si el job corre muy temprano y aún no cargó “ayer”?
(¿Se permite reintento manual?)  Si, lo imporante que que solo refleje dias TERMINADOS


El usuario solo puede ajustar un restaurante y mes a la vez

Debe calcular los valores de todos los campos, para los almacenes y para los grupos de almacén tomando en cuenta los ajustes de presupuesto que se configuren en la vista 


Vista de Ajustes de Presupuesto
Crea un Gráfico Mensual donde pueda escoger los locales (no grupos), que muestre el canal incluyendo todos



Que muestre la curva de presupuesto, real, Año Anterior y Año Anterior Ajustado que estará calculado 
Es necesario que el usuario pueda Mover la curva para arriba o abajo en el gráfico y ajustarla viendo los valores

Que pueda ver en el mismo grafico el año completo pero que no pueda aplicar ajustes, solo a un local y mes, canal o canales.

Reglas de Ajuste:
Lo que se ajusta positivo o negativo debe afectar los demas dias para mantener el presupuesto mensual correcto

Distribuir en todos los dias del mes
Distribuir en la semana
Distribuir en todos los dias del mes de mismo tipo de dia  es decir todos los lunes

Todo tiene que ser dinamico para efectos del grafico, y que el usuario pueda ver el impacto con otros filtros, hasta que de gualdar 

Que estos ajustes se guarden en un base de datos, para poder revisarlos, y que quede vitacora de los cambios, quien y hora y dia

Guarda los ajustes como te parezca mejor 
• Porcentaje (ej. +3%)
• Monto absoluto (ej. +₡250,000)
• Factor (ej. 1.03)
• Ajuste por día (vector diario)
• o una combinación

Todo ajuste afecta a todos los demás cálculos, pero solo en el mes para mantener la consistencia más precisa con la tabla original de KpisRosti_Consolidado_Mensual

oficial exacto:
	• AUTO → AutoPollo ✅ (asumo)
	• TOTAL no se usa como canal fuente, sino que se recalcula como Todos ✅ (asumo)
	• SALON → Salón (con tilde en salida) ✅ (asumo)

Llave unica para localizacion:  CODALMACEN

La Serie del grupo también será sintética (ej. G + correlativo / o 2 chars)
Todos los grupos visibles (CODVISIBLE=20) deben incluirse siempre, aunque tengan 0 presupuesto

• Si existe evento, uso esa equivalencia fija (por ejemplo 15 agosto ↔ 15 agosto).
• Si no existe evento, aplico desplazamiento por día de semana (lunes con lunes).



Estructura y explicación

CREATE TABLE [dbo].[RSM_ALCANCE_DIARIO](
	[Fecha] [datetime] NULL,
	[idLocal] [int] NULL,
	[Local] [nvarchar](255) NULL,
	[Serie] [varchar](2) NULL,
	[idDia] [int] NULL,  -- 
	[Dia] [nvarchar](255) NULL,
	[Mes] [int] NULL,
	[Monto] [float] NULL, -- PRESUPUESTO
	[CodAlmacen] [nvarchar](10) NULL,
	[Participacion] [float] NULL,
	[Canal] [nvarchar](200) NULL, -- AutoPollo, ECommerce, Express, Llevar, Salón, UberEats y Todos
	[Año] [int] NULL,
	[Tipo] [nvarchar](100) NULL, -- TQP Transacciones Ventas
	[FechaAnterior] [datetime] NULL,  -- Fecha del año anterior día natural 1 enero vs 1enero
	[MontoAnterior] [float] NULL, -- Monto real año anterior usar tabla BI_VENTAS_ROSTIPOLLOS
	[ParticipacionAnterior] [float] NULL, 
	[FechaAnteriorAjustada] [datetime] NULL,   -- Fecha del año día ajustado es decir lunes con lunes
	[MontoAnteriorAjustado] [float] NULL,  -- Monto real año anterior usar tabla BI_VENTAS_ROSTIPOLLOS
	[ParticipacionAnteriorAjustado] [float] NULL,
	[MontoReal] [float] NULL, -- Monto real presente tabla BI_VENTAS_ROSTIPOLLOS
	[ParticipacionReal] [float] NULL, 
	[Monto_Acumulado] [float] NULL, -- Monto del presupuesto acumulado a la última fecha del modelo
	[MontoAnterior_Acumulado] [float] NULL, -- Monto Real acumulado a la última fecha del modelo para día natural
	[MontoAnteriorAjustado_Acumulado] [float] NULL,  -- Monto Real acumulado a la última fecha del modelo para día ajustado es decir lunes con lunes
	[Monto_Dif] [float] NULL, -- diferencia entre [MontoReal y [Monto_Acumulado] 
	[MontoAnterior_Dif] [float] NULL,  -- diferencia entre [MontoReal y [MontoAnterior_Acumulado]
	[MontoAnteriorAjustado_Dif] [float] NULL, -- diferencia entre [MontoReal y [MontoAnteriorAjustado_Acumulado]
	[Llave_Presupuesto] [nvarchar](400) NULL, -- Eliminar de la tabla
	[Llave_AñoAnterior] [nvarchar](400) NULL, , -- Eliminar de la tabla
	[Llave_AnoAnterior_Ajustado] [nvarchar](400) NULL , -- Eliminar de la tabla
) ON [PRIMARY]
GO


CREATE TABLE [dbo].[BI_VENTAS_ROSTIPOLLOS](
	[NUMSERIE] [nvarchar](4) NOT NULL,
	[NUMFACTURA] [int] NOT NULL,
	[RESTAURANTE] [nvarchar](30) NULL,
	[FECHA] [datetime] NULL, -- Llave para las fechas
	[ANO] [int] NULL,
	[MES] [int] NULL,
	[HORA] [int] NULL,
	[CODVENDEDOR] [int] NULL,
	[NOMVENDEDOR] [nvarchar](255) NULL,
	[CODSALONERO] [int] NULL,
	[SALONERO] [nvarchar](255) NULL,
	[VENTAS NETAS] [float] NULL,  -- Datos de Ventas
	[Transacciones] [int] NOT NULL, -- Datos de Transacciones
	[COD_TIPO SERVICIO] [int] NULL,
	[TIPO SERVICIO] [nvarchar](35) NULL,
	[ID_METODO VENTA] [int] NULL,
	[METODO DE VENTA] [nvarchar](100) NULL,
	[TIPO_UBER] [nvarchar](100) NULL,
	[NOMBRECLIENTE] [nvarchar](255) NULL,
	[TELEFONO1] [nvarchar](15) NULL,
	[FORMADEPAGO] [nvarchar](30) NULL,
	[SEMANA] [int] NULL,
	[CODALMACEN] [nvarchar](4) NULL, -- LLAVE para Almacenes y Grupos
	[DIASEMANA] [int] NULL,
	[PLATAFORMA] [nvarchar](300) NULL,
	[COMENSALES] [int] NULL,
	[HORA_PEDIDO] [int] NULL,
	[CANAL] [nvarchar](200) NULL, -- datos de canal
	[CODCLIENTE] [int] NULL
) ON [PRIMARY]
GO


CREATE TABLE [dbo].[DIM_EVENTOS_FECHAS](
	[IDEVENTO] [int] NULL,
	[FECHA] [date] NULL,  -- FECHA AFECTADA EN PRESUPUESTO
	[FECHA_EFECTIVA] [date] NULL,  --- SE QUE EL NOMBRE ESTA MAL PERO ES LA FECHA DE REFERENCIA
	[Canal] [nchar](100) NULL,
	[GrupoAlmacen] [int] NULL,
	[USUARIO_MODIFICACION] [nvarchar](200) NULL,
	[FECHA_MODIFICACION] [datetime] NULL
) ON [PRIMARY]
GO


CREATE TABLE [dbo].[DIM_EVENTOS](
	[IDEVENTO] [int] IDENTITY(1,1) NOT NULL,
	[EVENTO] [nvarchar](200) NULL,
	[ESFERIADO] [nvarchar](1) NULL,
	[USARENPRESUPUESTO] [nvarchar](1) NULL,
	[ESINTERNO] [nvarchar](1) NULL,
PRIMARY KEY CLUSTERED 
(
	[IDEVENTO] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO



Campo identificador del presupuesto en RSM_ALCANCE_DIARIO
	• ¿Autorizas agregar un campo como NombrePresupuesto (ej. Presupuesto 2026, Presupuesto 2027) en RSM_ALCANCE_DIARIO y RSM_ALCANCE_DIARIO_TEST para no mezclar presupuestos? SI


Ajuste cuando el usuario mueve Todos
	• Cuando ajusten el canal Todos, ¿cómo quieres repartir ese ajuste en los canales base (AutoPollo, ECommerce, Express, Llevar, Salón, UberEats)?
	• Recomendado: reparto proporcional según el presupuesto del mes por canal.

Ajuste directo de TQP
	• Confirmar: ¿TQP no se ajusta directamente?
	• O sea, solo se ajustan Ventas y/o Transacciones, y TQP siempre se recalcula (Ventas / Transacciones). Siempre calculado, ya que todo debe ajustarse al la tabla KpisRosti_Consolidado_Mensual

Método para cuadrar Transacciones enteras al total mensual
	• Confirmar si aplicamos este método:
		○ distribuir por participación (decimal)
		○ redondear a enteros
		○ repartir residuo por “restos mayores”
	• Esto garantiza que el total mensual cierre exacto.  Confirmado

Normalización de canales de BI_VENTAS_ROSTIPOLLOS
	• ¿Tienes un catálogo oficial de equivalencias para BI_VENTAS_ROSTIPOLLOS.CANAL?
	• Si no, ¿te parece que cree una tabla de mapeo (CANAL_ORIGEN → CANAL_ESTANDAR) para normalizar variantes?
No es necesario una tabla, la equivalencia ya existe para el año 2025 y 2026

Alcance del versionado (snapshot)
	• ¿La versión con sufijo debe guardar:
		○ solo los registros del NombrePresupuesto actual (recomendado), o
		○ toda la tabla destino? Toda la tabla
	Alcance de restauración de versión
		• Cuando se restaura una versión, ¿quieres restaurar:
			○ solo el NombrePresupuesto seleccionado (recomendado), o
			○ reemplazar toda la tabla destino? Solo el periodo en la tabla destino
	
	• Manejo de Semana Santa (Excepción Crítica): Mencionaste excepciones fijas (Día de la Madre) y variables (Viernes Negro). ¿Necesitas que incluyamos lógica para Semana Santa?
		• Contexto: Al ser una fecha que se mueve mucho (marzo o abril), si usamos la lógica estándar de "Lunes con Lunes", compararemos una semana santa 2026 contra una semana normal 2025 (o viceversa), lo cual distorsionará gravemente el presupuesto. ¿La tratamos como excepción o la ignoramos?  USA el metodo que elijas mas preciso
	• Lógica de Distribución Automática (Suma Cero): Indicaste que al ajustar un día, el presupuesto mensual debe mantenerse (lo que sube uno, baja en otros).
		• Pregunta: Cuando el usuario hace el ajuste en el gráfico, ¿quieres que el Stored Procedure reciba un parámetro de "Método de Distribución" (ej: Distribuir_En_Semana, Distribuir_En_Mes_Proporcional) y que SQL se encargue de recalcular/prorratear la diferencia en los días restantes automáticamente? Usa el metodo mas preciso que decidas

	• Conflicto "Lunes con Lunes" vs. "Cierre de Mes": Al desplazar fechas para calzar días de la semana (Lunes 2026 vs Lunes 2025), a veces el día equivalente cae en el mes anterior o siguiente del año pasado.
		• Pregunta: ¿Qué tiene prioridad?
			○ A: Mantener estrictamente el día de la semana (aunque comparemos 1 de Febrero con 31 de Enero).
			○ B: Forzar que la referencia se quede en el mismo mes (aunque rompamos la lógica de día de semana en los bordes del mes).
			○ Debes usar la participacion del dia que se ajusta aunque sea de otro mes, incluso de otro año
			
	• Permisos de Base de Datos (Versiones): Para crear las tablas RSM_ALCANCE_DIARIO_v... y borrarlas cuando superen las 15 versiones, necesito usar SQL Dinámico.
		• Pregunta: ¿El usuario de base de datos que ejecuta el Job/Procedimiento tiene permisos explícitos de DDL (CREATE TABLE, DROP TABLE)? (Esto es inusual en usuarios estándar, necesito confirmar para no generar un script que falle por permisos).  Si todos los permisos
		
		
		
		1. Estructura exacta de KpisRosti_Consolidado_Mensual (Crucial para el ETL)
		Mencionas que esta tabla origen tiene los canales en columnas (SALON, LLEVAR, AUTO...). Sin embargo, el modelo maneja dos métricas base: Ventas y Transacciones.
			• Duda: ¿Cómo están estructuradas estas métricas en esa tabla? ¿Existe una columna llamada Tipo donde una fila tiene las Ventas de todos los canales y otra fila tiene las Transacciones para el mismo mes/local? ¿O acaso las columnas están divididas por tipo (ej. SALON_Ventas, SALON_Transacciones)?No tipo solo tiene Salón o Llevar, etc.  
		2. Tabla de Mapeo de Locales (Clonación de curvas)
		Mencionaste la regla: "Mall San Pedro (S84) usa la participación de Lincoln (S32)".
			• Duda: Para que el Stored Procedure aplique esta regla dinámicamente, ¿debo incluir en el diseño la creación de una tabla nueva (por ejemplo, DIM_MAPEO_PRESUPUESTO_LOCALES con columnas IdLocalNuevo e IdLocalReferencia) para que la administren desde la UI de configuración, o ya tienen una tabla de homologación en su base de datos que deba utilizar? Decide tu si es necesario
		3. Rendimiento del Recálculo (UI vs Job Nocturno)
		Tenemos dos disparadores del recálculo: el Job automatizado (que actualiza las ventas reales) y el usuario haciendo ajustes manuales en la UI o modificando el consolidado.
			• Duda: Cuando el usuario ajusta un canal en el gráfico y le da "Guardar", ¿quieres que el Stored Procedure recalcule todo el año y todos los locales (lo cual puede tardar unos segundos más), o prefieres que el SP reciba parámetros opcionales (@Local, @Mes) para recalcular únicamente la porción afectada y responder casi en tiempo real a la interfaz? Como creas que sea mas eficiente
			
			
			1. Ajuste del canal Todos
				○ Cuando el usuario ajusta Todos, ¿cómo se reparte el ajuste entre los canales base (AutoPollo, ECommerce, Express, Llevar, Salón, UberEats)? proporcionalmente
			2. Restauración de versión: qué significa “solo el periodo”
				○ Cuando dices “solo el periodo en la tabla destino”, necesito confirmar si “periodo” es:
					§ todo el año del presupuesto (ej. 2026),
					§ un mes,
					§ un rango de fechas,
					§ o todo el NombrePresupuesto. ESTA nombre del presupuesto
			3. Retención de 15 versiones
				○ Las 15 versiones se conservan:
					§ por tabla destino (PROD y TEST por separado),
					§ por NombrePresupuesto,
					§ o global entre todo? La versiones no incluyen test
			4. idLocal sintético para grupos
				○ Falta definir cómo generar idLocal para los grupos (CODVISIBLE = 20) para evitar choques con locales reales. Busca la logica que mejor te funcione
			5. Llave única exacta para evitar duplicados
				○ Confirmar si la unicidad final será:
					§ NombrePresupuesto + Fecha + CodAlmacen + Canal + Tipo
				○ (Necesito confirmar que incluye Tipo.) Si, todos los campos que conderes
			6. Regla de NULL en DIM_EVENTOS_FECHAS
				○ Si Canal viene NULL, ¿aplica a todos los canales? Si
				○ Si GrupoAlmacen viene NULL, ¿aplica a todos los locales/grupos? Si
			7. Equivalencia de canales (ya existe)
				○ Confirmaste que la equivalencia de canales ya existe para 2025 y 2026.
				○ Solo necesito saber dónde está (si el campo CANAL ya viene normalizado o si hay una lógica/código existente que debo reutilizar). Ninguna logica, Salón = Salón etc
			8. Prioridad de referencias cuando faltan datos
				○ Cuando coincidan varias reglas de referencia (por local nuevo, por canal, por mes no cerrado), ¿qué prioridad aplico primero? (ej. canal > local > mes, o otra).  Asi como lo defines
			9. Bitácora de ajustes
				○ Falta confirmar:
					§ si Motivo/Comentario es obligatorio o no, Si obligatorio pero la mayoria son automaticas, por que corre en job, solo las manuales
					§ y si el campo Origen debe guardarse explícitamente (manual, recálculo, restore). si
					
					
					1. Estructura exacta de KpisRosti_Consolidado_Mensual (crítica)
						○ Falta confirmar cómo vienen Ventas y Transacciones en esa tabla (porque dijiste que “tipo” no es Ventas/Transacciones, sino canales).
						○ Necesito saber exactamente:
							§ columnas reales,
							§ cuál columna identifica el local (CodAlmacen, Serie, nombre, etc.),
							§ cómo se identifica mes/año,
							§ y dónde vienen las métricas mensuales base (Ventas y Transacciones).
						○ Con eso se cierra el ETL del presupuesto diario.  TIPO ES Ventas, Transacciones, TQP (tiquete promedio)
					2. Prioridad exacta de referencias cuando falten datos
						○ Me pusiste “así como lo defines”, pero necesito dejarlo explícito en el diseño.
						○ ¿Confirmamos esta prioridad?
							§ Referencia por canal > referencia por local > referencia por mes/cierre no terminado
						○ (Si quieres otro orden, lo cambio). Ese orden
