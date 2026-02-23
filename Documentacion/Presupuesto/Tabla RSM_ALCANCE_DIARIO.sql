USE [RP_BI_RESUMENES]
GO

/****** Object:  Table [dbo].[RSM_ALCANCE_DIARIO]    Script Date: 14/02/2026 0:31:13 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[RSM_ALCANCE_DIARIO](
	[Fecha] [datetime] NULL,
	[idLocal] [int] NULL,
	[Local] [nvarchar](255) NULL,
	[Serie] [varchar](2) NULL,
	[idDia] [int] NULL,
	[Dia] [nvarchar](255) NULL,
	[Mes] [int] NULL,
	[Monto] [float] NULL,
	[CodAlmacen] [nvarchar](10) NULL,
	[Participacion] [float] NULL,
	[Canal] [nvarchar](200) NULL,
	[Año] [int] NULL,
	[Tipo] [nvarchar](100) NULL,
	[FechaAnterior] [datetime] NULL,
	[MontoAnterior] [float] NULL,
	[ParticipacionAnterior] [float] NULL,
	[FechaAnteriorAjustada] [datetime] NULL,
	[MontoAnteriorAjustado] [float] NULL,
	[ParticipacionAnteriorAjustado] [float] NULL,
	[MontoReal] [float] NULL,
	[ParticipacionReal] [float] NULL,
	[Monto_Acumulado] [float] NULL,
	[MontoAnterior_Acumulado] [float] NULL,
	[MontoAnteriorAjustado_Acumulado] [float] NULL,
	[Monto_Dif] [float] NULL,
	[MontoAnterior_Dif] [float] NULL,
	[MontoAnteriorAjustado_Dif] [float] NULL,
	[Llave_Presupuesto] [nvarchar](400) NULL,
	[Llave_AñoAnterior] [nvarchar](400) NULL,
	[Llave_AnoAnterior_Ajustado] [nvarchar](400) NULL
) ON [PRIMARY]
GO


