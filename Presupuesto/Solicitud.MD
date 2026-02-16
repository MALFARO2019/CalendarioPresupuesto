Objetivo Principal: 

Opciones: Calendario Mensual, Calendario Anual y Comportamiento de Tendencia
R0st1p017

---- GENERAR ----
Tiene que verse moderna, rápida, y colorida

Datos de muestra: Archivo presupuestoahoy.xls.
Estructura del calendario: Archivo Calendario Alcance 2026 v6.xlsx (incluyendo la hoja de parámetros).
Consulta SQL:
sql
SELECT * FROM RSM_ALCANCE_DIARIO WHERE AÑO = 2026
la estructura de la tabla esta en Tabla RSM_ALCANCE_DIARIO.sql

Los grupos de almacen 
SELECT * FROM ROSTIPOLLOS_P.DBO.GRUPOSALMACENCAB GA
INNER JOIN ROSTIPOLLOS_P.DBO.GRUPOSALMACENLIN GL
	ON GL.IDGRUPO = GA.IDGRUPO 
WHERE GA.CODVISIBLE = 20

idgrupo 3000 es  codalmacen G00 el idgrupo 3001 es coddalmacen G01, por ejemplo

Ten en cuenta que esta tabla se actualiza una vez cada noche, por lo tanto los el último día siempre es ayer.

Por ahora solo usa opciones de año 2026

Requerimientos Funcionales: Desarrollar una aplicación web que visualice la información presupuestaria utilizando los datos obtenidos. Las métricas clave a mostrar son:

CAMPO  DESCRIPCION

Año: Año del presupuesto
Mes: Mes del presupuesto
Local: Local del presupuesto
Canal: Canal del presupuesto, Todos es la sumatoria de todos los canales
Tipo: Tipo del presupuesto, Ventas, Transacciones o Tiquete promedio
iddia: Día de la semana donde 1 es Lunes y 7 es Domingo 
dia : numero de dia del mes
MontoReal: Ventas o transacciones o Tiquete promedio reales.
Monto: Presupuesto.
MontoAcumulado: Presupuesto acumulado.
MontoAnterior: Ventas/transacciones del año anterior.
MontoAnterior_Acumulado: Acumulado del año anterior.
MontoAnteriorAjustado: Año anterior ajustado.
MontoAnteriorAjustado_Acumulado: Acumulado ajustado.

La diferencia de AñoAnterior y AñoAnteriorAjustado es que el primero usa dias naturales es decir 1 con 1, y el segundo lunes con lunes es decir día de la semana 

Primer día de la semana LUNES

Los colores son Igual a 100% o mayor verde, entre 90% y 100 naranja, menor a 90% rojo.
Mira que usa parametros como año, local, canal, mes, y tipo de comparacion con presupuesto o año anterior, 

--- Parametros ---
AÑO

LOCAL: En la seleccion de locales no agregues todos los locales como opción, revisa el excel de grupos de almacen y dejalos al fina de la selección, esto incluye grupos como Corporativo, SSS, Ventanitas

TIPO: Ventas, Transacciones o Tiquete promedio

CANAL: El canal Todos es la sumatoria de todos los demas canales

COMPARAR CON: Presupuesto o Año anterior o Año anterior ajustado

Selecciona tipo de año anterior: Año anterior ajustado o no. (para el gráfico y la tarjeta de resumen)

--- Fin Parametros


Los locales reales son los Codalmacen agrupados, en grupos de almacen.

Los porcentajes deben ser con un solo decimal y coloreado el fondo tal y como se ve en la imagen de diseño. 

Conexión a Base de datos:  Necesito colocar esta WEB en un servidor de Azure y que extraiga los datos de un modelo semantico de Power BI que se llama BI Ventas, y que tambien pueda conctar sql directo, para esto necesito una forma de indicar cual usar, indicar servidor, base de datos y credenciales.  Servidor 10.29.1.14, base de datos RP_BI_RESUMENES usuarios : sa, clave : masterkey
Busca una manera que cada la carga de SQL sea muy rápida, y si el usuario solo tiene un local configurado, carga una vez intrese a la pantalla web

Los valores estan expresados en colones costarricenses para ventas, trasancciones son numeros enteros sin simbolo demoneda, y tiquete promedio tambien en colones costarricenses

Seguridad:
Necesito un esquema de seguridad para que el usuario registre su corrreo y dependiendo de este tendrá acceso a ver diferentes almacenes, o grupos de almacen.  Necesito la opción de configuracion con la clave R0st1p017  las estructras que necesitas las creas en la base de datos. que envie una clave de 6 digitos para poder ingresar, y que solo el administrador pueda cambiar. Que el usuario no tenga que volver a colocar el correo y clave talvez en un cookie, a no ser que el administrador borre el usuario o cambie la clave. 
Da opción de enviar la clave por correo usando SQL
    EXEC msdb.dbo.sp_send_dbmail @recipients=@Destinatarios,  
    @subject = @ICGSubjet,  
    @body = @tableHTML,  
    @body_format = 'HTML' ;  

DEbe poder modificar las opciones del usuario


Imagen Rosti:
La aplicación tiene de titulo:  Calendario de Presupuesto 
usa el logo LogoRosti.png y trata que la web tenga una imange corporativa

Al final coloca un tarjeta con explicando 
"Año anterior compara dia natural 1 con 1, y Año anterior Ajustado compara dia de la semana lunes con lunes"
"PA: Presupuesto Acumulado"

Genera un boton que diga "Generar Reporte" y que al presionarlo genere un reporte en PDF con la informacion del calendario, usa una libreria para generar el PDF, y que tenga la misma informacion que el calendario, con los mismos colores y formato, y que tenga el logo de Rosti.


---- Calendario Mensual ----

Convertir un calendario de presupuesto basado en Excel Calendario de Alcance 2026a una solución web dinámica.

Esta web es una aplicación donde el usuario pueda ver el comportamiento de cada local, por día y saber cuanto le toca vender a futuro. Tiene que verse moderna, rápida, y colorida

CREA un diseño y me das una imagen para entende como lo vas a hacer

Agregar 

zona de parametros Calendario y parametros.png

zona de resumen Calendario y parametros.png
Esta tarjeta tiene 3 tarjetas internas que inician con *

*Contra PRESUPUESTO
Alcance Canal Todos Coronado   Año: 2026  Mes:1 al 12/02/2026			
    Ventas	Transacciones	TQP
P. Mes	41,133,078  	3,569  	11,525  (presupuesto mes es el campo monto)
P Acum	41,133,078  	3,569  	11,525  (MontoAcumulado)
Real	38,997,417  	3,278  	11,897  (montoReal)
dif acum	2,135,661  	291  	-372    (Dif. Acum = Real - Presupuesto Acumulado ) 
Alcance	94.8%	91.8%	103.2%          (Acumulado/Real)*100
Saldo	2,135,661	291	-372            (Monto - Real)

* Contra Año Anterior
Alcance Canal Todos Coronado   Año: 2026  Mes:1 al 12/02/2026			
    Ventas	Transacciones	TQP
Mes	41,133,078  	3,569  	11,525   (MontoAnterior)
P Acum	41,133,078  	3,569  	11,525   (MontoAnterior_Acumulado)
Real	38,997,417  	3,278  	11,897   (montoReal)
dif acum	2,135,661  	291  	-372   (MontoAnterior_Acumulado - MontoReal)
Alcance	94.8%	91.8%	103.2%   (MontoAnterior_Acumulado / MontoReal)*100
Saldo	2,135,661	291	-372   (MontoAnterior_Acumulado - MontoReal)

*Saldo días: 16	(dias que faltan para que acabe el mes, tener en cuenta que los datos siempre tienen un dia de rezago)	
16		
Incrementos necesarios por día (OR)		
Venta	Transacciones	TQP
133,479  	18  	37  

Venta es la cantidad de dinero que falta por vender
Transacciones es la cantidad de transacciones que faltan por realizar
TQP es el tiquete promedio que falta por realizar


zona de calendario  Calendario y parametros.png
Zona de Grafico de lineas con legendas Grafico de dias.png
Los dias futuros no deben sumar 0 y deben aparecer sin porcentaje para evitar promedios erroneos

Zona de comportamiento dia semana Resumen parte del dia.png
El campo que identifica el dia de la semana es iddia 1 es lunes
Semana	Ppto	Real	Diff %	Crec %
W1	$165k	$133k	-19.3%	-34.3%
W2	$213k	$320k	+50.6%	26.2%
etc

Zona de comportamiento de semanas Comportamiento semana.png
Día	Ppto	Real	Diff %	Crec %
Lunes	$165k	$133k	-19.3%	-34.3%
Martes	$213k	$320k	+50.6%	26.2%
etc

Colocar juntos zoans de dia y semana y de semanas para que se vean mejor

Utiliza las imagenes de la carpeta Imagenes para entender como se debe ver.
Tiene que graficamente muy moderno y atractivo, 
usa la imagen Calendario y parametros.png para que entiendas como se debe ver.


-- Calendario Anual ---
Parecido al mensual, pero los datos por mes con acumulado anual
Crea una imagen para entender como lo diseñas
Los datos usan la misma tabla de la base de datos de RSM_ALCANCE_DIARIO

--- Tendencia Alcance ---
Usa el archivo Tendencia KPI Ventas 2026 V6.xlsx que tiene un hoja de parametros, evaluacion, y resumen. Es un pantallazo del estado de todos los locales y agrupaciones. 
Para que el usuario tenga acceso a esta web debe tener permisos especificos. El diseño no tiene que ser exactamente igual, pero si debe tener la misma informacion y funcionalidad. 
Crea una imagen para entender como lo diseñas

Para la pantalla de evaluacion agrega un combo box de opción para escoger los top mas buenos en ventas y mas malos en ventas
Los datos usan la misma tabla de la base de datos de RSM_ALCANCE_DIARIO


--- Eventos ---
EN Eventos.sql Y EjemploEventos.xlsx encontraras una estructura de tablas para eventos, que se usa para calcular la tabla de rsm_alcance_diario. La tabla DIM_EVENTOS define los tipos de eventos que se pueden configurar, y la tabla dim_eventos_fechas define las fechas que aplican para los eventos.
La funcionalidad de esta tabla para el calculo no es importante para esta aplicacion, pero si requiero una pantalla para poder dar mantenimiento a estas tablas, para que el usuario pueda agregar eventos y fechas para los eventos.  Acceseder a esta pantalla solo se puede hacer desde la configuracion, no desde la configuración de permisos. modifica la tabla de eventos fechas para que quede registrado quien la modifico usando el usuario. 
