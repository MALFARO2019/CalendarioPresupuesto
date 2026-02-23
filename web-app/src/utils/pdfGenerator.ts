import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Generate PDF for Monthly Calendar
 */
export async function generateMonthlyCalendarPDF(
    elementId: string,
    year: number,
    month: number,
    storeName: string,
    userName: string
): Promise<void> {
    try {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error('Calendar element not found');
            return;
        }

        // Capture calendar as canvas
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        // Create PDF (landscape for better calendar fit)
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        // Add logo
        await addLogoToPDF(pdf, 10, 10, 30, 15);

        // Add header
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        pdf.setFontSize(18);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Calendario ${monthNames[month - 1]} ${year}`, 148, 15, { align: 'center' });

        // Add metadata
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Local: ${storeName}`, 148, 22, { align: 'center' });
        pdf.text(`Generado: ${new Date().toLocaleDateString('es-CR')} - Usuario: ${userName}`, 148, 27, { align: 'center' });

        // Add calendar image
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 277; // A4 landscape width minus margins
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 10, 35, imgWidth, imgHeight);

        // Download PDF
        pdf.save(`Calendario_${year}_${monthNames[month - 1]}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw new Error('Error al generar el PDF. Por favor intente nuevamente.');
    }
}

/**
 * Generate PDF for Annual Calendar
 */
export async function generateAnnualCalendarPDF(
    elementId: string,
    year: number,
    storeName: string,
    userName: string
): Promise<void> {
    try {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error('Calendar element not found');
            return;
        }

        // Capture calendar as canvas
        const canvas = await html2canvas(element, {
            scale: 1.5,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        // Create PDF (landscape)
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a3' // Larger format for annual calendar
        });

        // Add logo
        await addLogoToPDF(pdf, 10, 10, 30, 15);

        // Add header
        pdf.setFontSize(20);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Calendario Anual ${year}`, 210, 15, { align: 'center' });

        // Add metadata
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Local: ${storeName}`, 210, 23, { align: 'center' });
        pdf.text(`Generado: ${new Date().toLocaleDateString('es-CR')} - Usuario: ${userName}`, 210, 29, { align: 'center' });

        // Add calendar image
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 400; // A3 landscape width minus margins
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 10, 35, imgWidth, Math.min(imgHeight, 250));

        // Download PDF
        pdf.save(`Calendario_Anual_${year}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw new Error('Error al generar el PDF. Por favor intente nuevamente.');
    }
}

/**
 * Generate PDF for Tendencia Report
 */
export async function generateTendenciaPDF(
    elementId: string,
    year: number,
    dateRange: string,
    kpi: string,
    channel: string,
    userName: string
): Promise<void> {
    try {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error('Tendencia element not found');
            return;
        }

        // Capture tendencia as canvas
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        // Create PDF (landscape)
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        // Add logo
        await addLogoToPDF(pdf, 10, 10, 30, 15);

        // Add header
        pdf.setFontSize(18);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Reporte Tendencia Alcance ${year}`, 148, 15, { align: 'center' });

        // Add metadata
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Período: ${dateRange}`, 148, 22, { align: 'center' });
        pdf.text(`KPI: ${kpi} | Canal: ${channel}`, 148, 27, { align: 'center' });
        pdf.text(`Generado: ${new Date().toLocaleDateString('es-CR')} - Usuario: ${userName}`, 148, 32, { align: 'center' });

        // Add tendencia image
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 277;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 10, 40, imgWidth, Math.min(imgHeight, 160));

        // Download PDF
        pdf.save(`Tendencia_${year}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw new Error('Error al generar el PDF. Por favor intente nuevamente.');
    }
}

/**
 * Helper function to add Rosti logo to PDF
 */
async function addLogoToPDF(pdf: jsPDF, x: number, y: number, width: number, height: number): Promise<void> {
    try {
        const logoImg = new Image();
        logoImg.src = '/LogoRosti.png';

        await new Promise((resolve, reject) => {
            logoImg.onload = resolve;
            logoImg.onerror = reject;
        });

        // Convert image to base64
        const canvas = document.createElement('canvas');
        canvas.width = logoImg.width;
        canvas.height = logoImg.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(logoImg, 0, 0);
            const logoData = canvas.toDataURL('image/png');
            pdf.addImage(logoData, 'PNG', x, y, width, height);
        }
    } catch (error) {
        console.error('Error adding logo to PDF:', error);
        // Continue without logo
    }
}
