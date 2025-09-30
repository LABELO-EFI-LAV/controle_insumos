import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SourceTextModule } from 'vm';
import { DatabaseManager } from './DatabaseManager';
const PDFKit = require('pdfkit');
const PDFDocument = PDFKit.default || PDFKit;
const { SimpleLinearRegression } = require('ml-regression-simple-linear');

let lastDbUpdateTime: number = 0;
const POLLING_INTERVAL = 5000;
// ========================================================================
// START: Added Utility Functions
// ========================================================================

/**
 * Função segura para obter chaves de objetos, evitando erros com null/undefined.
 * @param obj Objeto para extrair chaves.
 * @returns Array de chaves ou array vazio se o objeto for inválido.
 */
function safeObjectKeys(obj: any): string[] {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return [];
    }
    try {
        return Object.keys(obj);
    } catch (error) {
        return [];
    }
}

// ========================================================================
// END: Added Utility Functions
// ========================================================================

// --- SISTEMA DE BACKUP AUTOMÁTICO ---
class BackupManager {
    private backupDir: string;
    private maxBackups: number = 30; // Manter 30 backups
    private backupInterval: NodeJS.Timeout | null = null;

    constructor(workspaceRoot: string) {
        this.backupDir = path.join(workspaceRoot, '.labcontrol-backups');
        this.ensureBackupDirectory();
    }

    private ensureBackupDirectory(): void {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
            // Diretório de backup criado
        }
    }

    /**
     * Cria um backup do banco de dados (SQLite ou JSON)
     */
    
    createBackup(dbPath: string): boolean {
        try {
            if (!fs.existsSync(dbPath)) {
                // Arquivo de banco de dados não encontrado para backup
                return false;
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const isJsonFile = dbPath.endsWith('.json');
            const extension = isJsonFile ? '.json' : '.sqlite';
            const backupFileName = `database-backup-${timestamp}${extension}`;
            const backupPath = path.join(this.backupDir, backupFileName);

            // Copia o arquivo
            fs.copyFileSync(dbPath, backupPath);

            // Adiciona metadados do backup
            const metadataPath = path.join(this.backupDir, `${backupFileName}.meta`);
            const metadata = {
                originalPath: dbPath,
                backupDate: new Date().toISOString(),
                fileSize: fs.statSync(dbPath).size,
                version: this.getNextVersion(),
                type: isJsonFile ? 'json' : 'sqlite'
            };
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

            // Backup criado com sucesso
            this.cleanOldBackups();
            return true;
        } catch (error) {
            console.error('❌ Erro ao criar backup:', error);
            return false;
        }
    }

    /*
     * Remove backups antigos mantendo apenas os mais recentes
     */
    
    private cleanOldBackups(): void {
        try {
            const backupFiles = fs.readdirSync(this.backupDir)
                .filter(file => file.startsWith('database-backup-') && (file.endsWith('.json') || file.endsWith('.sqlite')))
                .map(file => ({
                    name: file,
                    path: path.join(this.backupDir, file),
                    mtime: fs.statSync(path.join(this.backupDir, file)).mtime
                }))
                .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

            if (backupFiles.length > this.maxBackups) {
                const filesToDelete = backupFiles.slice(this.maxBackups);
                filesToDelete.forEach(file => {
                    fs.unlinkSync(file.path);
                    // Remove também o arquivo de metadados
                    const metaPath = `${file.path}.meta`;
                    if (fs.existsSync(metaPath)) {
                        fs.unlinkSync(metaPath);
                    }
                    // Backup antigo removido
                });
            }
        } catch (error) {
            console.error('❌ Erro ao limpar backups antigos:', error);
        }
    }
    
    /**
     * Obtém o próximo número de versão
     */
    
    private getNextVersion(): number {
        try {
            const backupFiles = fs.readdirSync(this.backupDir)
                .filter((file: string) => file.endsWith('.meta'));
            
            let maxVersion = 0;
            backupFiles.forEach(file => {
                try {
                    const metadata = JSON.parse(fs.readFileSync(path.join(this.backupDir, file), 'utf8'));
                    if (metadata.version && metadata.version > maxVersion) {
                        maxVersion = metadata.version;
                    }
                } catch (e) {
                    // Ignora arquivos de metadados corrompidos
                }
            });
            
            return maxVersion + 1;
        } catch (error) {
            return 1;
        }
    }
    
    /**
     * Lista todos os backups disponíveis
     */ 
    
    listBackups(): Array<{name: string, date: string, size: number, version: number, type: string}> {
        try {
            const backupFiles = fs.readdirSync(this.backupDir)
                .filter(file => file.startsWith('database-backup-') && (file.endsWith('.json') || file.endsWith('.sqlite')))
                .map(file => {
                    const filePath = path.join(this.backupDir, file);
                    const metaPath = `${filePath}.meta`;
                    
                    let metadata = { backupDate: '', version: 0, type: file.endsWith('.json') ? 'json' : 'sqlite' };
                    if (fs.existsSync(metaPath)) {
                        try {
                            const metaContent = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                            metadata = { ...metadata, ...metaContent };
                        } catch (e) {
                            // Usa dados padrão se metadados estiverem corrompidos
                        }
                    }
                    
                    return {
                        name: file,
                        date: metadata.backupDate || fs.statSync(filePath).mtime.toISOString(),
                        size: fs.statSync(filePath).size,
                        version: metadata.version || 0,
                        type: metadata.type
                    };
                })
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            return backupFiles;
        } catch (error) {
            console.error('❌ Erro ao listar backups:', error);
            return [];
        }
    }
    
    /**
     * Restaura um backup específico
     */
    restoreBackup(backupName: string, targetPath: string): boolean {
        try {
            const backupPath = path.join(this.backupDir, backupName);
            if (!fs.existsSync(backupPath)) {
                console.error(`❌ Backup não encontrado: ${backupName}`);
                return false;
            }

            // Cria backup do arquivo atual antes de restaurar
            if (fs.existsSync(targetPath)) {
                const currentBackupName = `database-backup-before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
                fs.copyFileSync(targetPath, path.join(this.backupDir, currentBackupName));
            }

            // Restaura o backup
            fs.copyFileSync(backupPath, targetPath);
            // Backup restaurado com sucesso
            return true;
        } catch (error) {
            console.error('❌ Erro ao restaurar backup:', error);
            return false;
        }
    }

    /**
     * Inicia backup automático a cada 6 horas
     */
    
    startAutoBackup(dbPath: string): void {
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
        }

        // Backup imediato
        this.createBackup(dbPath);

        // Backup a cada 6 horas (21600000 ms)
        this.backupInterval = setInterval(() => {
            this.createBackup(dbPath);
        }, 6 * 60 * 60 * 1000);

        // Sistema de backup automático iniciado (a cada 6 horas)
    }

    /**
     * Para o backup automático
     */
    stopAutoBackup(): void {
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
            this.backupInterval = null;
            // Sistema de backup automático parado
        }
    }
}

let backupManager: BackupManager | null = null;
let databaseManager: DatabaseManager | null = null;
let isCommandRegistered = false;

// --- FUNÇÕES DE CÁLCULO OTIMIZADAS ---
// Calcula o número de tiras de sujidade com base na carga nominal
const calculateTiras = (nominalLoad: number): number => {
    if (nominalLoad <= 2.4) { return 2; }
    if (nominalLoad <= 3.4) { return 3; }
    if (nominalLoad <= 4.4) { return 4; }
    if (nominalLoad <= 5.4) { return 5; }
    if (nominalLoad <= 6.4) { return 6; }
    if (nominalLoad <= 7.4) { return 7; }
    return 8;
};

interface Consumption {
    poBase: number;
    perborato: number;
    taed: number;
    tiras: number;
}

/**
 * Calcula o consumo total de reagentes para um ensaio.
 * @param nominalLoad A carga nominal do ensaio.
 * @param cycles O número de ciclos.
 * @returns Um objeto do tipo Consumption.
 */
const calculateConsumption = (nominalLoad: number, cycles: number): Consumption => {
    // Calculando consumo para carga nominal e ciclos
    const base = (16 * nominalLoad + 54) * cycles;
    const tiras = calculateTiras(nominalLoad) * cycles;
    return {
        poBase: base * 0.77,
        perborato: base * 0.20,
        taed: base * 0.03,
        tiras: tiras,
    };
};


// --- FIM DAS FUNÇÕES DE CÁLCULO ---
/**
 * Gera um relatório em PDF com base nos dados fornecidos.
 * @param reportData - Dados do relatório
 * @param extensionPath - Caminho da extensão
 * @returns Promise<string | null> - Caminho do arquivo PDF gerado ou null em caso de erro
 */
async function generatePdfReport(reportData: any, extensionPath: string): Promise<string | null> {
    try {
        // Validação dos dados de entrada
        if (!reportData) {
            throw new Error('Dados do relatório não fornecidos');
        }
        
        const { startDate, endDate, assays, inventory } = reportData;
        
        // Validações básicas
        if (!startDate || !endDate) {
            throw new Error('Datas de início e fim são obrigatórias');
        }
        
        if (!Array.isArray(assays)) {
            // Array de ensaios inválido, usando array vazio
            reportData.assays = [];
        }
        
        if (!Array.isArray(inventory)) {
            // Array de inventário inválido, usando array vazio
            reportData.inventory = [];
        }
        
        // Gerando PDF com dados
        const totalAssays = assays?.length || 0;
        const totalInventory = inventory?.length || 0;
        
        // Cria o documento PDF
        const doc = new PDFDocument({ margin: 50 });
        
        // Define o caminho do arquivo PDF
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('Nenhuma pasta de workspace aberta');
        }
        
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const startFormatted = new Date(startDate).toLocaleDateString('pt-BR').replace(/\//g, '-');
        const endFormatted = new Date(endDate).toLocaleDateString('pt-BR').replace(/\//g, '-');
        const pdfPath = path.join(workspaceRoot, `Relatorio_${startFormatted}_a_${endFormatted}.pdf`);
        
        // Configurando geração do PDF
        
        // Verifica se o diretório existe
        if (!fs.existsSync(workspaceRoot)) {
            throw new Error(`Diretório do workspace não existe: ${workspaceRoot}`);
        }
        
        // Cria o stream de escrita
        const stream = fs.createWriteStream(pdfPath);
        doc.pipe(stream);
        
        // Stream de escrita criado
        
        // Filtra ensaios por período
        let filteredAssays = [];
        
        if (Array.isArray(assays) && assays.length > 0) {
            filteredAssays = assays.filter((assay: any) => {
                // Tenta diferentes propriedades de data que podem existir
                const dateValue = assay.date || assay.startDate || assay.createdAt || assay.timestamp;
                if (!dateValue) {
                    // Ensaio sem data encontrado
                    return false;
                }
                
                try {
                    const assayDate = new Date(dateValue);
                    const start = new Date(startDate);
                    const end = new Date(endDate);
                    
                    // Verifica se as datas são válidas
                    if (isNaN(assayDate.getTime()) || isNaN(start.getTime()) || isNaN(end.getTime())) {
                        // Data inválida encontrada
                        return false;
                    }
                    
                    return assayDate >= start && assayDate <= end;
                } catch (error) {
                    // Erro ao processar data do ensaio
                    return false;
                }
            });
        }
        
        // Ensaios filtrados por período
        
        // Gera o cabeçalho
        await generatePdfHeader(doc, startDate, endDate, filteredAssays.length, extensionPath);
        
        // Gera as tabelas e gráficos
        await generatePdfTables(doc, filteredAssays, inventory);
        await generatePdfCharts(doc, filteredAssays);
        
        // Finaliza o documento
        doc.end();
        
        // Aguarda a conclusão da escrita
        return new Promise((resolve, reject) => {
            stream.on('finish', () => {
                // Stream finalizado
                // Verifica se o arquivo foi realmente criado
                if (fs.existsSync(pdfPath)) {
                    const stats = fs.statSync(pdfPath);
                    // Arquivo PDF criado com sucesso
                    resolve(pdfPath);
                } else {
                    reject(new Error(`Arquivo PDF não foi criado: ${pdfPath}`));
                }
            });
            stream.on('error', (error) => {
                // Erro no stream
                reject(error);
            });
        });
        
    } catch (error) {
        // Erro ao gerar PDF
        return null;
    }
}

/**
 * Gera o cabeçalho do relatório PDF.
 */
async function generatePdfHeader(doc: any, startDate: string, endDate: string, totalAssays: number, extensionPath: string) {
    // Título principal
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .fillColor('#2563eb')
       .text('Relatório de Controle de Insumos', 50, 50);
    
    // Subtítulo com período
    const startFormatted = new Date(startDate).toLocaleDateString('pt-BR');
    const endFormatted = new Date(endDate).toLocaleDateString('pt-BR');
    
    doc.fontSize(14)
       .font('Helvetica')
       .fillColor('#6b7280')
       .text(`Período: ${startFormatted} a ${endFormatted}`, 50, 85);
    
    // Total de ensaios
    doc.fontSize(12)
       .fillColor('#374151')
       .text(`Total de ensaios realizados: ${totalAssays}`, 50, 110);
    
    // Adiciona o ícone (se existir)
    const iconPath = path.join(extensionPath, 'images', 'icon.png');
    if (fs.existsSync(iconPath)) {
        try {
            doc.image(iconPath, 450, 50, { width: 60, height: 60 });
        } catch (error) {
            // Não foi possível adicionar o ícone ao PDF
        }
    }
    
    // Linha separadora
    doc.moveTo(50, 140)
       .lineTo(550, 140)
       .strokeColor('#e5e7eb')
       .stroke();
    
    // Move o cursor para baixo
    doc.y = 160;
}

/**
 * Gera as tabelas do relatório PDF.
 */
async function generatePdfTables(doc: any, assays: any[], inventory: any[]) {
    let currentY = doc.y + 30;
    
    // Página 1: Tabelas 1 e 2
    currentY = generateTable1(doc, assays, currentY);
    currentY += 30;
    currentY = generateTable2(doc, assays, currentY);
    
    // Página 2: Tabela 3 e Gráfico 1
    doc.addPage();
    currentY = 50;
    currentY = generateTable3(doc, assays, inventory, currentY);
    currentY += 40;
    currentY = generateChart1(doc, assays, currentY);
    
    doc.y = currentY;
}

/**
 * Gera os gráficos do relatório PDF (representados como tabelas por simplicidade).
 */
async function generatePdfCharts(doc: any, assays: any[]) {
    // Página 3: Gráficos 2 e 3
    doc.addPage();
    let currentY = 50;
    
    // Gráfico 2: Consumo de reagente por lote
    currentY = generateChart2(doc, assays, currentY);
    currentY += 40;
    
    // Gráfico 3: Consumo de reagente por fabricante
    currentY = generateChart3(doc, assays, currentY);
    
    // Página 4: Gráfico 4
    doc.addPage();
    currentY = 50;
    
    // Gráfico 4: Quantidade de ensaios por mês
    currentY = generateChart4(doc, assays, currentY);
}

/**
 * Tabela 1: Quantidade de ensaios por reagente e lote
 */
function generateTable1(doc: any, assays: any[], startY: number): number {
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#1f2937')
       .text('Tabela 1: Ensaios por Reagente e Lote', 50, startY);
    
    // Texto de análise
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#6b7280')
       .text('Esta tabela apresenta a distribuição de ensaios realizados por tipo de reagente e lote específico, permitindo identificar quais lotes foram mais utilizados durante o período analisado.', 50, startY + 25, {
           width: 500,
           align: 'justify'
       });
    
    let y = startY + 55;
    
    // Fundo azul marinho para o cabeçalho
    doc.rect(50, y - 5, 400, 20)
       .fillColor('#1e3a8a')
       .fill();
    
    // Cabeçalho da tabela com texto branco
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#ffffff');
    
    doc.text('Reagente', 55, y, { width: 140, align: 'center' })
       .text('Lote', 205, y, { width: 140, align: 'center' })
       .text('Ensaios', 355, y, { width: 90, align: 'center' });
    
    y += 20;
    
    // Processa dados reais dos ensaios
    const reagentStats: any = {};
    
    assays.forEach((assay: any) => {
        if (assay.lots) {
            ['poBase', 'perborato', 'taed', 'tiras'].forEach(reagentType => {
                const reagentName = {
                    'poBase': 'Pó Base',
                    'perborato': 'Perborato', 
                    'taed': 'TAED',
                    'tiras': 'Tiras de Sujidade'
                }[reagentType];
                
                if (assay.lots[reagentType]) {
                    assay.lots[reagentType].forEach((lotInfo: any) => {
                        const key = `${reagentName}-${lotInfo.lot}`;
                        if (!reagentStats[key]) {
                            reagentStats[key] = {
                                reagent: reagentName,
                                lot: lotInfo.lot,
                                assayCount: 0,
                                totalCycles: 0,
                                manufacturer: assay.assayManufacturer || 'N/A'
                            };
                        }
                        reagentStats[key].assayCount += 1;
                        reagentStats[key].totalCycles += lotInfo.cycles || 0;
                    });
                }
            });
        }
    });
    
    // Dados da tabela
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#000000');
    
    const sortedData = Object.values(reagentStats).sort((a: any, b: any) => 
        a.reagent.localeCompare(b.reagent) || a.lot.localeCompare(b.lot)
    );
    
    if (sortedData.length === 0) {
        doc.text('Nenhum dado encontrado para o período selecionado', 55, y);
        y += 15;
    } else {
        sortedData.forEach((item: any, index: number) => {
            // Fundo alternado (branco/cinza claro)
            const bgColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
            doc.rect(50, y - 2, 400, 15)
               .fillColor(bgColor)
               .fill();
            
            // Texto preto
            doc.fillColor('#000000')
               .text(item.reagent, 55, y, { width: 140, align: 'center' })
               .text(item.lot, 205, y, { width: 140, align: 'center' })
               .text(item.assayCount.toString(), 355, y, { width: 90, align: 'center' });
            y += 15;
        });
    }
    
    return y + 20;
}

/**
 * Tabela 2: Top 5 fabricantes com maior consumo
 */
function generateTable2(doc: any, assays: any[], startY: number): number {
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#1f2937')
       .text('Tabela 2: Top 5 Fabricantes - Maior Consumo', 50, startY);
    
    // Texto de análise
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#6b7280')
       .text('Ranking dos cinco fabricantes com maior consumo de reagentes, mostrando a quantidade de ensaios realizados, ciclos totais e consumo detalhado por tipo de reagente.', 50, startY + 25, {
           width: 500,
           align: 'justify'
       });
    
    let y = startY + 55;
    
    // Fundo azul marinho para o cabeçalho
    doc.rect(50, y - 5, 500, 20)
       .fillColor('#1e3a8a')
       .fill();
    
    // Cabeçalho da tabela com texto branco
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#ffffff');
    
    doc.text('Posição', 55, y, { width: 50, align: 'center' })
       .text('Fabricante', 115, y, { width: 100, align: 'center' })
       .text('Pó Base (g)', 225, y, { width: 70, align: 'center' })
       .text('Perborato (g)', 305, y, { width: 70, align: 'center' })
       .text('TAED (g)', 385, y, { width: 70, align: 'center' })
       .text('Tiras (un)', 465, y, { width: 70, align: 'center' });
    
    y += 20;
    
    // Processa dados reais dos fabricantes
    const manufacturerStats: any = {};
    
    assays.forEach((assay: any) => {
        const manufacturer = assay.assayManufacturer || 'Não informado';
        
        if (!manufacturerStats[manufacturer]) {
            manufacturerStats[manufacturer] = {
                name: manufacturer,
                assayCount: 0,
                totalCycles: 0,
                poBase: 0,
                perborato: 0,
                taed: 0,
                tiras: 0
            };
        }
        
        manufacturerStats[manufacturer].assayCount += 1;
        manufacturerStats[manufacturer].totalCycles += assay.cycles || 0;
        
        // Calcula consumo baseado nos ciclos e carga nominal
        if (assay.nominalLoad && assay.cycles) {
            const base = (16 * assay.nominalLoad + 54) * assay.cycles;
            const tirasCalc = (assay.nominalLoad <= 3 ? 1 : assay.nominalLoad <= 5 ? 2 : assay.nominalLoad <= 7 ? 3 : assay.nominalLoad <= 9 ? 4 : 5) * assay.cycles;
            
            manufacturerStats[manufacturer].poBase += base * 0.77;
            manufacturerStats[manufacturer].perborato += base * 0.20;
            manufacturerStats[manufacturer].taed += base * 0.03;
            manufacturerStats[manufacturer].tiras += tirasCalc;
        }
    });
    
    // Ordena por total de ciclos (maior consumo)
    const sortedManufacturers = Object.values(manufacturerStats)
        .sort((a: any, b: any) => b.totalCycles - a.totalCycles)
        .slice(0, 5);
    
    // Dados da tabela
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#000000');
    
    if (sortedManufacturers.length === 0) {
        doc.text('Nenhum dado encontrado para o período selecionado', 55, y);
        y += 15;
    } else {
        sortedManufacturers.forEach((item: any, index: number) => {
            // Fundo alternado (branco/cinza claro)
            const bgColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
            doc.rect(50, y - 2, 500, 15)
               .fillColor(bgColor)
               .fill();
            
            // Texto preto
            const position = `${index + 1}º`;
            doc.fillColor('#000000')
               .text(position, 55, y, { width: 50, align: 'center' })
               .text(item.name, 115, y, { width: 100, align: 'center' })
               .text(Math.round(item.poBase).toString(), 225, y, { width: 70, align: 'center' })
               .text(Math.round(item.perborato).toString(), 305, y, { width: 70, align: 'center' })
               .text(Math.round(item.taed).toString(), 385, y, { width: 70, align: 'center' })
               .text(Math.round(item.tiras).toString(), 465, y, { width: 70, align: 'center' });
            y += 15;
        });
    }
    
    return y + 20;
}

/**
 * Tabela 3: Consumo detalhado por fornecedor
 */
function generateTable3(doc: any, assays: any[], inventory: any[], startY: number): number {
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#1f2937')
       .text('Tabela 3: Consumo Detalhado por Fornecedor', 50, startY);
    
    // Texto de análise
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#6b7280')
       .text('Detalhamento do consumo de reagentes por fornecedor e lote, incluindo quantidade consumida, estoque atual e data de validade, facilitando o controle de inventário.', 50, startY + 25, {
           width: 500,
           align: 'justify'
       });
    
    let y = startY + 55;
    
    // Fundo azul marinho para o cabeçalho
    doc.rect(50, y - 5, 500, 20)
       .fillColor('#1e3a8a')
       .fill();
    
    // Cabeçalho da tabela com texto branco
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#ffffff');
    
    doc.text('Fornecedor', 55, y, { width: 120, align: 'center' })
       .text('Reagente', 185, y, { width: 120, align: 'center' })
       .text('Lote', 315, y, { width: 100, align: 'center' })
       .text('Consumido (g/un)', 425, y, { width: 120, align: 'center' });
    y += 20;
    
    // Processa dados reais do inventário e calcula consumo
    const supplierStats: any = {};
    
    // Calcula consumo por lote baseado nos ensaios
    const lotConsumption: any = {};
    assays.forEach((assay: any) => {
        if (assay.lots && assay.nominalLoad && assay.cycles) {
            const base = (16 * assay.nominalLoad + 54) * assay.cycles;
            const tirasCalc = (assay.nominalLoad <= 3 ? 1 : assay.nominalLoad <= 5 ? 2 : assay.nominalLoad <= 7 ? 3 : assay.nominalLoad <= 9 ? 4 : 5) * assay.cycles;
            
            ['poBase', 'perborato', 'taed', 'tiras'].forEach(reagentType => {
                if (assay.lots[reagentType]) {
                    assay.lots[reagentType].forEach((lotInfo: any) => {
                        const key = `${reagentType}-${lotInfo.lot}`;
                        if (!lotConsumption[key]) {
                            lotConsumption[key] = {
                                reagentType,
                                lot: lotInfo.lot,
                                totalConsumed: 0
                            };
                        }
                        
                        const consumption = reagentType === 'poBase' ? base * 0.77 :
                                          reagentType === 'perborato' ? base * 0.20 :
                                          reagentType === 'taed' ? base * 0.03 :
                                          tirasCalc;
                        
                        lotConsumption[key].totalConsumed += consumption * (lotInfo.cycles || 0) / (assay.cycles || 1);
                    });
                }
            });
        }
    });
    
    // Combina com dados do inventário
    inventory.forEach((item: any) => {
        const reagentType = item.reagent === 'Pó Base' ? 'poBase' :
                           item.reagent === 'Perborato' ? 'perborato' :
                           item.reagent === 'TAED' ? 'taed' :
                           item.reagent === 'Tiras de Sujidade' ? 'tiras' : null;
        
        if (reagentType) {
            const key = `${reagentType}-${item.lot}`;
            const consumed = lotConsumption[key]?.totalConsumed || 0;
            
            const supplierKey = `${item.manufacturer}-${item.reagent}-${item.lot}`;
            supplierStats[supplierKey] = {
                supplier: item.manufacturer,
                reagent: item.reagent,
                lot: item.lot,
                consumed: consumed,
            };
        }
    });
    
    // Dados da tabela
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#6b7280');
    
    const sortedData = Object.values(supplierStats).sort((a: any, b: any) => 
        a.supplier.localeCompare(b.supplier) || a.reagent.localeCompare(b.reagent)
    );
    
    if (sortedData.length === 0) {
        doc.text('Nenhum dado encontrado no inventário', 55, y);
        y += 15;
    } else {
        sortedData.forEach((item: any, index: number) => {
            // Fundo alternado (branco/cinza claro)
            const bgColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
            doc.rect(50, y - 2, 500, 15)
               .fillColor(bgColor)
               .fill();
            
            // Texto preto
            const consumedText = item.consumed > 0 ? 
                (item.reagent === 'Tiras de Sujidade' ? `${Math.round(item.consumed)}` : `${Math.round(item.consumed)}`) : 
                '0';
            const stockText = item.reagent === 'Tiras de Sujidade' ? `${Math.round(item.stock)}` : `${Math.round(item.stock)}`;
            const validityText = new Date(item.validity).toLocaleDateString('pt-BR');
            
            doc.fillColor('#000000')
               .text(item.supplier, 55, y, { width: 120, align: 'center' })
               .text(item.reagent, 185, y, { width: 120, align: 'center' })
               .text(item.lot, 315, y, { width: 100, align: 'center' })
               .text(consumedText, 425, y, { width: 120, align: 'center' });
            y += 15;
        });
    }
    
    return y + 20;
}

/**
 * Gráfico 1: Quantidade de ciclos por fabricante (barras verticais)
 */
function generateChart1(doc: any, assays: any[], startY: number): number {
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#1f2937')
       .text('Gráfico 1: Ciclos por Fabricante', 50, startY);
    
    // Texto de análise
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#6b7280')
       .text('Visualização da quantidade total de ciclos realizados por cada fabricante, permitindo identificar quais são os mais utilizados no laboratório.', 50, startY + 25, {
           width: 500,
           align: 'justify'
       });
    
    let y = startY + 70;
    
    // Processa dados reais dos fabricantes
    const manufacturerCycles: any = {};
    
    assays.forEach((assay: any) => {
        const manufacturer = assay.assayManufacturer || 'Não informado';
        const cycles = assay.cycles || 0;
        
        if (!manufacturerCycles[manufacturer]) {
            manufacturerCycles[manufacturer] = 0;
        }
        manufacturerCycles[manufacturer] += cycles;
    });
    
    // Ordena por quantidade de ciclos (decrescente)
    const sortedData = Object.entries(manufacturerCycles)
        .map(([manufacturer, cycles]) => ({ manufacturer, cycles }))
        .sort((a: any, b: any) => b.cycles - a.cycles)
        .slice(0, 8); // Máximo 8 fabricantes
    
    if (sortedData.length === 0) {
        doc.fontSize(10)
           .fillColor('#6b7280')
           .text('Nenhum dado encontrado para o período selecionado', 50, y);
        return y + 30;
    }
    
    // Configurações do gráfico
    const chartWidth = 450;
    const chartHeight = 200;
    const chartX = 75;
    const chartY = y;
    const barWidth = Math.min(40, chartWidth / sortedData.length - 10);
    const maxCycles = Math.max(...sortedData.map((item: any) => item.cycles));
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];
    
    // Desenha eixos
    doc.strokeColor('#374151')
       .lineWidth(1)
       .moveTo(chartX, chartY)
       .lineTo(chartX, chartY + chartHeight)
       .moveTo(chartX, chartY + chartHeight)
       .lineTo(chartX + chartWidth, chartY + chartHeight)
       .stroke();
    
    // Linhas de grade horizontais
    doc.strokeColor('#e5e7eb')
       .lineWidth(0.5);
    for (let i = 1; i <= 5; i++) {
        const gridY = chartY + (chartHeight * i / 5);
        doc.moveTo(chartX, gridY)
           .lineTo(chartX + chartWidth, gridY)
           .stroke();
    }
    
    // Rótulos do eixo Y
    doc.fontSize(8)
       .fillColor('#6b7280')
       .font('Helvetica');
    for (let i = 0; i <= 5; i++) {
        const value = Math.round((maxCycles * (5 - i)) / 5);
        const labelY = chartY + (chartHeight * i / 5) - 3;
        doc.text(value.toString(), chartX - 25, labelY);
    }
    
    // Desenha barras e rótulos
    sortedData.forEach((item: any, index: number) => {
        const barHeight = maxCycles > 0 ? (item.cycles / maxCycles) * chartHeight : 0;
        const barX = chartX + 20 + (index * (chartWidth - 40) / sortedData.length);
        const barY = chartY + chartHeight - barHeight;
        const color = colors[index % colors.length];
        
        // Barra
        doc.rect(barX, barY, barWidth, barHeight)
           .fillColor(color)
           .fill();
        
        // Rótulo de dados no topo da barra
        doc.fontSize(8)
           .fillColor('#000000')
           .font('Helvetica-Bold')
           .text(item.cycles.toString(), barX + barWidth/2 - 10, barY - 12);
        
        // Rótulo do fabricante no eixo X
        doc.fontSize(7)
           .fillColor('#374151')
           .font('Helvetica');
        const manufacturerName = item.manufacturer.length > 8 ? 
            item.manufacturer.substring(0, 8) + '...' : item.manufacturer;
        doc.text(manufacturerName, barX - 5, chartY + chartHeight + 5, {
            width: barWidth + 10,
            align: 'center'
        });
    });
    
    // Título dos eixos
    doc.fontSize(10)
       .fillColor('#374151')
       .font('Helvetica-Bold')
       .text('Ciclos', chartX - 40, chartY + chartHeight/2 - 5, {
           rotate: -90
       })
       .text('Fabricantes', chartX + chartWidth/2 - 30, chartY + chartHeight + 25);
    
    return chartY + chartHeight + 50;
}

/**
 * Gráfico 2: Consumo por Lote e Reagente (barras verticais)
 */
function generateChart2(doc: any, assays: any[], startY: number): number {
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#1f2937')
       .text('Gráfico 2: Consumo por Lote e Reagente', 50, startY);
    
    // Texto de análise
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#6b7280')
       .text('Análise do consumo de reagentes separado por lote específico, com cores diferenciadas por tipo de reagente para facilitar a identificação dos padrões de uso.', 50, startY + 25, {
           width: 500,
           align: 'justify'
       });
    
    let y = startY + 50;
    
    // Legenda no topo
    const reagentColors = {
        'poBase': '#3b82f6',
        'perborato': '#ef4444',
        'taed': '#10b981',
        'tiras': '#f59e0b'
    };
    
    doc.fontSize(10)
       .fillColor('#374151')
       .font('Helvetica-Bold')
       .text('Legenda:', 50, y);
    
    let legendX2 = 110;
    Object.entries(reagentColors).forEach(([reagentType, color]) => {
        const reagentName = {
            'poBase': 'Pó Base',
            'perborato': 'Perborato',
            'taed': 'TAED',
            'tiras': 'Tiras'
        }[reagentType];
        
        // Quadrado colorido
        doc.rect(legendX2, y - 2, 8, 8)
           .fillColor(color)
           .fill();
        
        // Texto da legenda
        doc.fontSize(8)
           .fillColor('#374151')
           .font('Helvetica')
           .text(reagentName || '', legendX2 + 12, y);
        
        legendX2 += (reagentName?.length || 0) * 5 + 25;
    });
    
    y += 30;
    
    // Processa dados reais de consumo por lote e reagente
    const lotReagentConsumption: any = {};
    
    assays.forEach((assay: any) => {
        if (assay.lots && assay.nominalLoad && assay.cycles) {
            const base = (16 * assay.nominalLoad + 54) * assay.cycles;
            const tirasCalc = (assay.nominalLoad <= 3 ? 1 : assay.nominalLoad <= 5 ? 2 : assay.nominalLoad <= 7 ? 3 : assay.nominalLoad <= 9 ? 4 : 5) * assay.cycles;
            
            ['poBase', 'perborato', 'taed', 'tiras'].forEach(reagentType => {
                if (assay.lots[reagentType]) {
                    assay.lots[reagentType].forEach((lotInfo: any) => {
                        const lot = lotInfo.lot;
                        const cycles = lotInfo.cycles || 0;
                        const key = `${lot}-${reagentType}`;
                        
                        if (!lotReagentConsumption[key]) {
                            lotReagentConsumption[key] = {
                                lot: lot,
                                reagentType: reagentType,
                                reagentName: {
                                    'poBase': 'Pó Base',
                                    'perborato': 'Perborato',
                                    'taed': 'TAED',
                                    'tiras': 'Tiras'
                                }[reagentType],
                                consumption: 0
                            };
                        }
                        
                        const consumption = reagentType === 'poBase' ? base * 0.77 :
                                          reagentType === 'perborato' ? base * 0.20 :
                                          reagentType === 'taed' ? base * 0.03 :
                                          tirasCalc;
                        
                        lotReagentConsumption[key].consumption += consumption * cycles / (assay.cycles || 1);
                    });
                }
            });
        }
    });
    
    // Ordena por consumo (decrescente) e pega os top 12
    const sortedData = Object.values(lotReagentConsumption)
        .sort((a: any, b: any) => b.consumption - a.consumption)
        .slice(0, 12);
    
    if (sortedData.length === 0) {
        doc.fontSize(10)
           .fillColor('#6b7280')
           .text('Nenhum dado encontrado para o período selecionado', 50, y);
        return y + 30;
    }
    
    // Usa as cores já definidas acima
    
    // Configurações do gráfico
    const chartWidth = 450;
    const chartHeight = 200;
    const chartX = 75;
    const chartY = y;
    const barWidth = Math.min(30, chartWidth / sortedData.length - 5);
    const maxConsumption = Math.max(...sortedData.map((item: any) => item.consumption));
    
    // Desenha eixos
    doc.strokeColor('#374151')
       .lineWidth(1)
       .moveTo(chartX, chartY)
       .lineTo(chartX, chartY + chartHeight)
       .moveTo(chartX, chartY + chartHeight)
       .lineTo(chartX + chartWidth, chartY + chartHeight)
       .stroke();
    
    // Linhas de grade horizontais
    doc.strokeColor('#e5e7eb')
       .lineWidth(0.5);
    for (let i = 1; i <= 5; i++) {
        const gridY = chartY + (chartHeight * i / 5);
        doc.moveTo(chartX, gridY)
           .lineTo(chartX + chartWidth, gridY)
           .stroke();
    }
    
    // Rótulos do eixo Y
    doc.fontSize(8)
       .fillColor('#6b7280')
       .font('Helvetica');
    for (let i = 0; i <= 5; i++) {
        const value = Math.round((maxConsumption * (5 - i)) / 5);
        const labelY = chartY + (chartHeight * i / 5) - 3;
        doc.text(value.toString(), chartX - 25, labelY);
    }
    
    // Desenha barras e rótulos
    sortedData.forEach((item: any, index: number) => {
        const barHeight = maxConsumption > 0 ? (item.consumption / maxConsumption) * chartHeight : 0;
        const barX = chartX + 20 + (index * (chartWidth - 40) / sortedData.length);
        const barY = chartY + chartHeight - barHeight;
        const color = reagentColors[item.reagentType as keyof typeof reagentColors] || '#6b7280';
        
        // Barra
        doc.rect(barX, barY, barWidth, barHeight)
           .fillColor(color)
           .fill();
        
        // Rótulo de dados no topo da barra
        const unit = item.reagentType === 'tiras' ? 'un' : 'g';
        doc.fontSize(7)
           .fillColor('#000000')
           .font('Helvetica-Bold')
           .text(Math.round(item.consumption).toString(), barX + barWidth/2 - 8, barY - 12);
        
        // Rótulo do lote no eixo X
        doc.fontSize(6)
           .fillColor('#374151')
           .font('Helvetica');
        const lotName = item.lot.length > 6 ? item.lot.substring(0, 6) + '...' : item.lot;
        doc.text(lotName, barX - 2, chartY + chartHeight + 5, {
            width: barWidth + 4,
            align: 'center'
        });
    });
    
    // Título dos eixos
    doc.fontSize(10)
       .fillColor('#374151')
       .font('Helvetica-Bold')
       .text('Consumo ', chartX - 50, chartY + chartHeight/2 - 5, {
           rotate: -90
       })
       .text('Lotes', chartX + chartWidth/2 - 15, chartY + chartHeight + 20);
    
    return chartY + chartHeight + 40;
}

/**
 * Gráfico 3: Consumo de Reagentes por Fabricante - Top 5 (barras verticais)
 */
function generateChart3(doc: any, assays: any[], startY: number): number {
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#1f2937')
       .text('Gráfico 3: Consumo de Reagentes por Fabricante - Top 5', 50, startY);
    
    // Texto de análise
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#6b7280')
       .text('Comparativo detalhado do consumo de cada tipo de reagente pelos cinco fabricantes com maior utilização, permitindo análise específica por categoria de reagente.', 50, startY + 25, {
           width: 500,
           align: 'justify'
       });
    
    let y = startY + 50;
    
    // Legenda no topo
    const reagentColors = {
        'poBase': '#3b82f6',
        'perborato': '#ef4444',
        'taed': '#10b981',
        'tiras': '#f59e0b'
    };
    
    doc.fontSize(10)
       .fillColor('#374151')
       .font('Helvetica-Bold')
       .text('Legenda:', 50, y);
    
    let legendX3 = 110;
    Object.entries(reagentColors).forEach(([reagentType, color]) => {
        const reagentName = {
            'poBase': 'Pó Base',
            'perborato': 'Perborato',
            'taed': 'TAED',
            'tiras': 'Tiras'
        }[reagentType];
        
        // Quadrado colorido
        doc.rect(legendX3, y - 2, 8, 8)
           .fillColor(color)
           .fill();
        
        // Texto da legenda
        doc.fontSize(8)
           .fillColor('#374151')
           .font('Helvetica')
           .text(reagentName || '', legendX3 + 12, y);
        
        legendX3 += (reagentName?.length || 0) * 5 + 25;
    });
    
    y += 30;
    
    // Processa dados reais de consumo por fabricante e reagente
    const manufacturerReagentConsumption: any = {};
    
    assays.forEach((assay: any) => {
        const manufacturer = assay.assayManufacturer || 'Não informado';
        
        if (assay.nominalLoad && assay.cycles) {
            const base = (16 * assay.nominalLoad + 54) * assay.cycles;
            const tirasCalc = (assay.nominalLoad <= 3 ? 1 : assay.nominalLoad <= 5 ? 2 : assay.nominalLoad <= 7 ? 3 : assay.nominalLoad <= 9 ? 4 : 5) * assay.cycles;
            
            if (!manufacturerReagentConsumption[manufacturer]) {
                manufacturerReagentConsumption[manufacturer] = {
                    manufacturer: manufacturer,
                    poBase: 0,
                    perborato: 0,
                    taed: 0,
                    tiras: 0,
                    total: 0
                };
            }
            
            const poBaseConsumption = base * 0.77;
            const perboratoConsumption = base * 0.20;
            const taedConsumption = base * 0.03;
            const tirasConsumption = tirasCalc;
            
            manufacturerReagentConsumption[manufacturer].poBase += poBaseConsumption;
            manufacturerReagentConsumption[manufacturer].perborato += perboratoConsumption;
            manufacturerReagentConsumption[manufacturer].taed += taedConsumption;
            manufacturerReagentConsumption[manufacturer].tiras += tirasConsumption;
            manufacturerReagentConsumption[manufacturer].total += poBaseConsumption + perboratoConsumption + taedConsumption + (tirasConsumption * 10); // Peso das tiras para ordenação
        }
    });
    
    // Ordena por consumo total e pega os top 5
    const sortedManufacturers = Object.values(manufacturerReagentConsumption)
        .sort((a: any, b: any) => b.total - a.total)
        .slice(0, 5);
    
    if (sortedManufacturers.length === 0) {
        doc.fontSize(10)
           .fillColor('#6b7280')
           .text('Nenhum dado encontrado para o período selecionado', 50, y);
        return y + 30;
    }
    
    // Usa as cores já definidas acima
    
    // Configurações do gráfico
    const chartWidth = 450;
    const chartHeight = 200;
    const chartX = 75;
    const chartY = y;
    const groupWidth = chartWidth / sortedManufacturers.length;
    const barWidth = Math.min(20, groupWidth / 5);
    
    // Calcula valor máximo para escala
    let maxValue = 0;
    sortedManufacturers.forEach((manufacturer: any) => {
        ['poBase', 'perborato', 'taed', 'tiras'].forEach(reagent => {
            if (manufacturer[reagent] > maxValue) {
                maxValue = manufacturer[reagent];
            }
        });
    });
    
    // Desenha eixos
    doc.strokeColor('#374151')
       .lineWidth(1)
       .moveTo(chartX, chartY)
       .lineTo(chartX, chartY + chartHeight)
       .moveTo(chartX, chartY + chartHeight)
       .lineTo(chartX + chartWidth, chartY + chartHeight)
       .stroke();
    
    // Linhas de grade horizontais
    doc.strokeColor('#e5e7eb')
       .lineWidth(0.5);
    for (let i = 1; i <= 5; i++) {
        const gridY = chartY + (chartHeight * i / 5);
        doc.moveTo(chartX, gridY)
           .lineTo(chartX + chartWidth, gridY)
           .stroke();
    }
    
    // Rótulos do eixo Y
    doc.fontSize(8)
       .fillColor('#6b7280')
       .font('Helvetica');
    for (let i = 0; i <= 5; i++) {
        const value = Math.round((maxValue * (5 - i)) / 5);
        const labelY = chartY + (chartHeight * i / 5) - 3;
        doc.text(value.toString(), chartX - 25, labelY);
    }
    
    // Desenha barras agrupadas por fabricante
    sortedManufacturers.forEach((manufacturer: any, manufacturerIndex: number) => {
        const groupX = chartX + 20 + (manufacturerIndex * groupWidth);
        
        ['poBase', 'perborato', 'taed', 'tiras'].forEach((reagent, reagentIndex) => {
            const consumption = manufacturer[reagent];
            const barHeight = maxValue > 0 ? (consumption / maxValue) * chartHeight : 0;
            const barX = groupX + (reagentIndex * barWidth);
            const barY = chartY + chartHeight - barHeight;
            const color = reagentColors[reagent as keyof typeof reagentColors];
            
            // Barra
            doc.rect(barX, barY, barWidth - 2, barHeight)
               .fillColor(color)
               .fill();
            
            // Rótulo de dados no topo da barra (apenas se valor > 0)
            if (consumption > 0) {
                const unit = reagent === 'tiras' ? '' : '';
                doc.fontSize(6)
                   .fillColor('#000000')
                   .font('Helvetica-Bold')
                   .text(Math.round(consumption).toString(), barX - 2, barY - 10, {
                       width: barWidth + 4,
                       align: 'center'
                   });
            }
        });
        
        // Rótulo do fabricante no eixo X
        doc.fontSize(7)
           .fillColor('#374151')
           .font('Helvetica');
        const manufacturerName = manufacturer.manufacturer.length > 10 ? 
            manufacturer.manufacturer.substring(0, 10) + '...' : manufacturer.manufacturer;
        doc.text(manufacturerName, groupX - 5, chartY + chartHeight + 5, {
            width: groupWidth,
            align: 'center'
        });
    });
    
    // Título dos eixos
    doc.fontSize(10)
       .fillColor('#374151')
       .font('Helvetica-Bold')
       .text('Consumo', chartX - 50, chartY + chartHeight/2 - 10, {
           rotate: -90
       })
       .text('Fabricantes', chartX + chartWidth/2 - 30, chartY + chartHeight + 20);
    
    return chartY + chartHeight + 40;
}

/**
 * Gráfico 4: Quantidade de ensaios por mês (barras verticais)
 */
function generateChart4(doc: any, assays: any[], startY: number): number {
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#1f2937')
       .text('Gráfico 4: Ensaios por Mês', 50, startY);
    
    // Texto de análise
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#6b7280')
       .text('Evolução temporal da quantidade de ensaios realizados por mês, mostrando tendências sazonais e padrões de atividade do laboratório ao longo do período.', 50, startY + 25, {
           width: 500,
           align: 'justify'
       });
    
    let y = startY + 70;
    
    // Processa dados reais de ensaios por mês
    const monthlyAssays: any = {};
    const monthNames = [
        'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
        'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ];
    
    assays.forEach((assay: any) => {
        // Usa startDate para determinar o mês
        const dateValue = assay.startDate || assay.date || assay.createdAt;
        if (dateValue) {
            try {
                const date = new Date(dateValue);
                if (!isNaN(date.getTime())) {
                    const year = date.getFullYear();
                    const month = date.getMonth();
                    const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
                    const monthName = `${monthNames[month]}/${year.toString().slice(-2)}`;
                    
                    if (!monthlyAssays[monthKey]) {
                        monthlyAssays[monthKey] = {
                            month: monthName,
                            count: 0,
                            sortKey: year * 100 + month
                        };
                    }
                    monthlyAssays[monthKey].count += 1;
                }
            } catch (error) {
                // Erro ao processar data do ensaio
            }
        }
    });
    
    // Ordena por data (mais antigo primeiro) e pega os últimos 12 meses
    const sortedData = Object.values(monthlyAssays)
        .sort((a: any, b: any) => a.sortKey - b.sortKey)
        .slice(-12);
    
    if (sortedData.length === 0) {
        doc.fontSize(10)
           .fillColor('#6b7280')
           .text('Nenhum dado encontrado para o período selecionado', 50, y);
        return y + 30;
    }
    
    // Configurações do gráfico
    const chartWidth = 450;
    const chartHeight = 200;
    const chartX = 75;
    const chartY = y;
    const barWidth = Math.min(30, chartWidth / sortedData.length - 5);
    const maxAssays = Math.max(...sortedData.map((item: any) => item.count));
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1', '#14b8a6', '#f59e0b'];
    
    // Desenha eixos
    doc.strokeColor('#374151')
       .lineWidth(1)
       .moveTo(chartX, chartY)
       .lineTo(chartX, chartY + chartHeight)
       .moveTo(chartX, chartY + chartHeight)
       .lineTo(chartX + chartWidth, chartY + chartHeight)
       .stroke();
    
    // Linhas de grade horizontais
    doc.strokeColor('#e5e7eb')
       .lineWidth(0.5);
    for (let i = 1; i <= 5; i++) {
        const gridY = chartY + (chartHeight * i / 5);
        doc.moveTo(chartX, gridY)
           .lineTo(chartX + chartWidth, gridY)
           .stroke();
    }
    
    // Rótulos do eixo Y
    doc.fontSize(8)
       .fillColor('#6b7280')
       .font('Helvetica');
    for (let i = 0; i <= 5; i++) {
        const value = Math.round((maxAssays * (5 - i)) / 5);
        const labelY = chartY + (chartHeight * i / 5) - 3;
        doc.text(value.toString(), chartX - 25, labelY);
    }
    
    // Desenha barras e rótulos
    sortedData.forEach((item: any, index: number) => {
        const barHeight = maxAssays > 0 ? (item.count / maxAssays) * chartHeight : 0;
        const barX = chartX + 20 + (index * (chartWidth - 40) / sortedData.length);
        const barY = chartY + chartHeight - barHeight;
        const color = colors[index % colors.length];
        
        // Barra
        doc.rect(barX, barY, barWidth, barHeight)
           .fillColor(color)
           .fill();
        
        // Rótulo de dados no topo da barra
        doc.fontSize(8)
           .fillColor('#000000')
           .font('Helvetica-Bold')
           .text(item.count.toString(), barX + barWidth/2 - 5, barY - 12);
        
        // Rótulo do mês no eixo X
        doc.fontSize(7)
           .fillColor('#374151')
           .font('Helvetica')
           .text(item.month, barX - 5, chartY + chartHeight + 5, {
               width: barWidth + 10,
               align: 'center'
           });
    });
    
    // Título dos eixos
    doc.fontSize(10)
       .fillColor('#374151')
       .font('Helvetica-Bold')
       .text('Ensaios', chartX - 40, chartY + chartHeight/2 - 5, {
           rotate: -90
       })
       .text('Meses', chartX + chartWidth/2 - 15, chartY + chartHeight + 25);
    
    return chartY + chartHeight + 50;
}

// Gera o conteúdo HTML para a Webview
export async function activate(context: vscode.ExtensionContext) {
    // --- CRIAÇÃO DO ITEM NA BARRA DE STATUS ---
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'controle-de-insumos.abrir';
    statusBarItem.text = `$(beaker) Controle de Insumos`;
    statusBarItem.tooltip = "Abrir Controle de insumos";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // --- FUNÇÃO AUXILIAR PARA INICIALIZAR O BANCO DE DADOS ---
    const initializeDatabase = async (): Promise<boolean> => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            console.error('LabControl: Por favor, abra uma pasta de projeto para usar a extensão.');
            return false;
        }
        
        const rootPath = workspaceFolders[0].uri.fsPath;
        
        try {
            // Inicializa o DatabaseManager
            databaseManager = new DatabaseManager(rootPath);
            await databaseManager.initialize();
            
            // Banco de dados SQLite inicializado com sucesso
            return true;
        } catch (error) {
            handleError(error, 'ERRO ao inicializar banco de dados SQLite:');
            return false;
        }
    };

    // --- FUNÇÃO AUXILIAR PARA COMPATIBILIDADE (DEPRECATED) ---
    const getDbPath = (): string | null => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }
        // Ajuste para retornar o caminho do banco SQLite
        return path.join(workspaceFolders[0].uri.fsPath, 'database.sqlite');
    };

    // --- INICIALIZAÇÃO DO SISTEMA DE BANCO DE DADOS E BACKUP ---
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        
        // Inicializa o banco de dados SQLite
        const dbInitialized = await initializeDatabase();
        if (!dbInitialized) {
            vscode.window.showErrorMessage('Erro ao inicializar banco de dados. A extensão pode não funcionar corretamente.');
            return;
        }
        
        // Inicializa o sistema de backup
        backupManager = new BackupManager(workspaceRoot);
        
        // Ajuste para usar o banco SQLite
        const dbPath = getDbPath();
        if (dbPath && fs.existsSync(dbPath)) {
            backupManager.startAutoBackup(dbPath);
        }
    }

    // --- REGISTRO DO COMANDO PRINCIPAL ---
    // Verifica se o comando já foi registrado para evitar duplicação
    if (isCommandRegistered) {
        // Comando já registrado, pulando registro
        return;
    }
    
    let disposable;
    try {
        disposable = vscode.commands.registerCommand('controle-de-insumos.abrir', () => {
            // Comando "controle-de-insumos.abrir" acionado

        const panel = vscode.window.createWebviewPanel(
            'labControl',
            'Controle de Insumos',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'images')),
                    vscode.Uri.file(path.join(context.extensionPath, 'webview')),
                ]
            }
        );

        const iconPatch = vscode.Uri.file(path.join(context.extensionPath, 'images', 'icon.png'));
        panel.iconPath = iconPatch;
        panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);
        
        const dbPath = getDbPath();
        if (!dbPath) return;

        // Inicia o "vigia" do arquivo
        const fileWatcherInterval = setInterval(async () => {
            try {
                const stats = fs.statSync(dbPath);
                const mtimeMs = stats.mtime.getTime();

                // Se o arquivo foi modificado desde a última verificação
                if (mtimeMs > lastDbUpdateTime) {
                    console.log('[File Watcher] Mudança detectada no banco de dados. Recarregando...');
                    lastDbUpdateTime = mtimeMs; // Atualiza o tempo

                    if (databaseManager) {
                        const updatedData = await databaseManager.getAllData();
                        // Envia uma mensagem para o frontend forçar a atualização
                        panel.webview.postMessage({
                            command: 'forceDataRefresh',
                            data: updatedData
                        });
                    }
                }
            } catch (err) {
                console.error('[File Watcher] Erro ao verificar o arquivo:', err);
            }
        }, POLLING_INTERVAL);

        // Limpa o intervalo quando o painel for fechado
        panel.onDidDispose(() => {
            clearInterval(fileWatcherInterval);
        });

        // --- LISTENER DE MENSAGENS DO WEBVIEW ---
        panel.webview.onDidReceiveMessage(async (message) => {
            // Mensagem recebida do webview
            const dbPath = getDbPath();

            if (!dbPath) {
                // Operação cancelada pois nenhuma pasta de projeto está aberta
                return; 
            }
            
            switch (message.command) {
                case 'webviewReady':
                    // Webview está pronto, carregando dados do SQLite
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }
                        
                        // Carregando dados do banco
                        const database = await databaseManager.getAllData();
                        // Dados carregados do banco
                        
                        // Obtém o nome do usuário do sistema operacional
                        const systemUsername = process.env.USERNAME || process.env.USER || 'unknown';
                        
                        // Lê os usuários cadastrados do banco SQLite
                        const systemUsers = database.systemUsers || {
                            // Usuário administrador padrão (sempre presente)
                            '10088141': {
                                username: '10088141',
                                type: 'administrador',
                                displayName: 'Administrador',
                                permissions: {
                                    editHistory: true,
                                    addEditSupplies: true,
                                    accessSettings: true,
                                    editSchedule: true,
                                    dragAndDrop: true,
                                    editCompletedAssays: true,
                                    addAssays: true
                                }
                            }
                        };
                        
                        // Usuários cadastrados no sistema
                        
                        // Determina o usuário baseado no username do sistema
                        const currentUser = systemUsers[systemUsername] || {
                            username: systemUsername,
                            type: 'visualizador',
                            displayName: 'Visualizador',
                            permissions: {
                                editHistory: false,
                                addEditSupplies: false,
                                accessSettings: false,
                                editSchedule: false,
                                dragAndDrop: false,
                                editCompletedAssays: false,
                                addAssays: false
                            }
                        };

                        const dbStats = fs.statSync(dbPath);
                        lastDbUpdateTime = dbStats.mtime.getTime();
                        
                        // Usuário mapeado e dados preparados para webview
                        
                        panel.webview.postMessage({
                            command: 'loadData',
                            data: database,
                            currentUser: currentUser
                        });
                    } catch (err) {
                        handleError(err, 'ERRO AO LER/ENVIAR DADOS DO SQLITE:');
                    }
                    break;

                case 'updateAssayStatusOnly':
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }

                        const { assayId, status, table } = message.data;
                        
                        // Usa a função otimizada para alterar apenas o status
                        await databaseManager.updateAssayStatus(assayId, status, table);
                        
                        // Status do ensaio alterado
                        
                        panel.webview.postMessage({
                            command: 'updateAssayStatusResult',
                            success: true,
                            assayId: assayId,
                            newStatus: status
                        });
                        
                    } catch (err) {
                        handleError(err, 'ERRO AO ATUALIZAR STATUS DO ENSAIO:');
                        panel.webview.postMessage({
                            command: 'updateAssayStatusResult',
                            success: false,
                            error: err instanceof Error ? err.message : 'Erro desconhecido'
                        });
                    }
                    break;

                case 'addInventoryItem':
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }

                        // Validação robusta dos dados recebidos
                        // Dados recebidos para addInventoryItem
                        
                        let item;
                        if (message.data && message.data.item) {
                            item = message.data.item;
                        } else if (message.data && message.data.reagent) {
                            // Se os dados vieram diretamente sem wrapper 'item'
                            item = message.data;
                        } else {
                            throw new Error('Dados do item não encontrados na mensagem');
                        }

                        // Validação dos campos obrigatórios
                        if (!item || typeof item !== 'object') {
                            throw new Error('Item deve ser um objeto válido');
                        }

                        const requiredFields = ['reagent', 'manufacturer', 'lot', 'quantity', 'validity'];
                        const missingFields = requiredFields.filter(field => !item[field]);
                        
                        if (missingFields.length > 0) {
                            throw new Error(`Campos obrigatórios ausentes: ${missingFields.join(', ')}`);
                        }

                        // Item validado
                        const newId = await databaseManager.addInventoryItem(item);
                        
                        panel.webview.postMessage({
                            command: 'inventoryOperationResult',
                            success: true,
                            operation: 'add',
                            newId: newId
                        });
                        
                    } catch (err) {
                        handleError(err, 'ERRO AO ADICIONAR ITEM AO INVENTÁRIO:');
                        panel.webview.postMessage({
                            command: 'inventoryOperationResult',
                            success: false,
                            operation: 'add',
                            error: err instanceof Error ? err.message : 'Erro desconhecido'
                        });
                    }
                    break;

                case 'updateInventoryItem':
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }

                        // O webview envia o item completo, extrair id e criar objeto updates
                        const item = message.data;
                        if (!item || !item.id) {
                            throw new Error('Item inválido: ID é obrigatório');
                        }

                        const { id, ...updates } = item;
                        await databaseManager.updateInventoryItem(id, updates);
                        
                        panel.webview.postMessage({
                            command: 'inventoryOperationResult',
                            success: true,
                            operation: 'update',
                            id: id
                        });
                        
                    } catch (err) {
                        handleError(err, 'ERRO AO ATUALIZAR ITEM DO INVENTÁRIO:');
                        panel.webview.postMessage({
                            command: 'inventoryOperationResult',
                            success: false,
                            operation: 'update',
                            error: err instanceof Error ? err.message : 'Erro desconhecido'
                        });
                    }
                    break;

                case 'deleteInventoryItem':
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }

                        const { id } = message.data;
                        await databaseManager.deleteInventoryItem(id);
                        
                        panel.webview.postMessage({
                            command: 'inventoryOperationResult',
                            success: true,
                            operation: 'delete',
                            id: id
                        });
                        
                    } catch (err) {
                        handleError(err, 'ERRO AO EXCLUIR ITEM DO INVENTÁRIO:');
                        panel.webview.postMessage({
                            command: 'inventoryOperationResult',
                            success: false,
                            operation: 'delete',
                            error: err instanceof Error ? err.message : 'Erro desconhecido'
                        });
                    }
                    break;

                case 'addHoliday':
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }

                        // Dados recebidos para addHoliday
                        const holiday = message.data;
                        const newId = await databaseManager.addHoliday(holiday);
                        
                        panel.webview.postMessage({
                            command: 'holidayOperationResult',
                            success: true,
                            operation: 'add',
                            newId: newId
                        });
                        
                    } catch (err) {
                        handleError(err, 'ERRO AO ADICIONAR FERIADO:');
                        panel.webview.postMessage({
                            command: 'holidayOperationResult',
                            success: false,
                            operation: 'add',
                            error: err instanceof Error ? err.message : 'Erro desconhecido'
                        });
                    }
                    break;

                case 'deleteHoliday':
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }

                        const { id } = message.data;
                        await databaseManager.deleteHoliday(id);
                        
                        panel.webview.postMessage({
                            command: 'holidayOperationResult',
                            success: true,
                            operation: 'delete',
                            id: id
                        });
                        
                    } catch (err) {
                        handleError(err, 'ERRO AO EXCLUIR FERIADO:');
                        panel.webview.postMessage({
                            command: 'holidayOperationResult',
                            success: false,
                            operation: 'delete',
                            error: err instanceof Error ? err.message : 'Erro desconhecido'
                        });
                    }
                    break;

                case 'addSystemUser':
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }

                        // Dados recebidos para addSystemUser
                        const user = message.data;
                        const newId = await databaseManager.addSystemUser(user);
                        
                        panel.webview.postMessage({
                            command: 'userOperationResult',
                            success: true,
                            operation: 'add',
                            newId: newId
                        });
                        
                    } catch (err) {
                        handleError(err, 'ERRO AO ADICIONAR USUÁRIO:');
                        panel.webview.postMessage({
                            command: 'userOperationResult',
                            success: false,
                            operation: 'add',
                            error: err instanceof Error ? err.message : 'Erro desconhecido'
                        });
                    }
                    break;

                case 'updateSystemUser':
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }

                        const { id, updates } = message.data;
                        await databaseManager.updateSystemUser(id, updates);
                        
                        panel.webview.postMessage({
                            command: 'userOperationResult',
                            success: true,
                            operation: 'update',
                            id: id
                        });
                        
                    } catch (err) {
                        handleError(err, 'ERRO AO ATUALIZAR USUÁRIO:');
                        panel.webview.postMessage({
                            command: 'userOperationResult',
                            success: false,
                            operation: 'update',
                            error: err instanceof Error ? err.message : 'Erro desconhecido'
                        });
                    }
                    break;

                case 'deleteSystemUser':
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }

                        const { id } = message.data;
                        await databaseManager.deleteSystemUser(id);
                        
                        panel.webview.postMessage({
                            command: 'userOperationResult',
                            success: true,
                            operation: 'delete',
                            id: id
                        });
                        
                    } catch (err) {
                        handleError(err, 'ERRO AO EXCLUIR USUÁRIO:');
                        panel.webview.postMessage({
                            command: 'userOperationResult',
                            success: false,
                            operation: 'delete',
                            error: err instanceof Error ? err.message : 'Erro desconhecido'
                        });
                    }
                    break;

                case 'addCategory':
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }

                        const { category, isSafety } = message.data;
                        const newId = await databaseManager.addCategory(category, isSafety);
                        
                        panel.webview.postMessage({
                            command: 'categoryOperationResult',
                            success: true,
                            operation: 'add',
                            newId: newId,
                            isSafety: isSafety
                        });
                        
                    } catch (err) {
                        handleError(err, 'ERRO AO ADICIONAR CATEGORIA:');
                        panel.webview.postMessage({
                            command: 'categoryOperationResult',
                            success: false,
                            operation: 'add',
                            error: err instanceof Error ? err.message : 'Erro desconhecido'
                        });
                    }
                    break;

                case 'deleteCategory':
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }

                        const { id, isSafety } = message.data;
                        await databaseManager.deleteCategory(id, isSafety);
                        
                        panel.webview.postMessage({
                            command: 'categoryOperationResult',
                            success: true,
                            operation: 'delete',
                            id: id,
                            isSafety: isSafety
                        });
                        
                    } catch (err) {
                        handleError(err, 'ERRO AO EXCLUIR CATEGORIA:');
                        panel.webview.postMessage({
                            command: 'categoryOperationResult',
                            success: false,
                            operation: 'delete',
                            error: err instanceof Error ? err.message : 'Erro desconhecido'
                        });
                    }
                    break;

                case 'updateSettings':
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }

                        const settings = message.data;
                        await databaseManager.updateSettings(settings);
                        
                        panel.webview.postMessage({
                            command: 'settingsOperationResult',
                            success: true,
                            operation: 'update'
                        });
                        
                    } catch (err) {
                        handleError(err, 'ERRO AO ATUALIZAR CONFIGURAÇÕES:');
                        panel.webview.postMessage({
                            command: 'settingsOperationResult',
                            success: false,
                            operation: 'update',
                            error: err instanceof Error ? err.message : 'Erro desconhecido'
                        });
                    }
                    break;

                case 'saveData':
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }

                        // Obtém dados atuais do banco
                        const currentDatabase = await databaseManager.getAllData();
                        
                        // Mescla com os novos dados
                        const dataToSave = {
                            ...currentDatabase,
                            ...message.data
                        };

                        // Salva no SQLite
                        await databaseManager.saveData(dataToSave);
                        
                        // Dados salvos com sucesso no SQLite
                        
                        // Cria backup do SQLite
                        if (backupManager) {
                            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                            if (workspaceRoot) {
                                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                                const backupPath = path.join(workspaceRoot, '.labcontrol-backups', `database-backup-${timestamp}.sqlite`);
                                await databaseManager.createBackup(backupPath);
                            }
                        }
                    } catch (err) {
                        handleError(err, 'ERRO AO SALVAR DADOS NO SQLITE:');
                    }
                    break;

                case 'saveScheduleData':
                    try {
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }

                        // Obtém dados atuais do banco
                        const currentDatabase = await databaseManager.getAllData();
                        
                        // Mescla com os novos dados do cronograma
                        const dataToSave = {
                            ...currentDatabase,
                            ...message.data
                        };

                        // Salva no SQLite
                        await databaseManager.saveData(dataToSave);
                        
                        // Cria backup do banco de dados
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        if (workspaceRoot) {
                            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                            const backupPath = path.join(workspaceRoot, '.labcontrol-backups', `database-backup-${timestamp}.sqlite`);
                            await databaseManager.createBackup(backupPath);
                        }
                        
                        console.log('[EXTENSION] Dados do cronograma salvos com sucesso no SQLite');
                        
                    } catch (err) {
                        handleError(err, 'ERRO AO SALVAR DADOS DO CRONOGRAMA NO SQLITE:');
                    }
                    break;

                case 'listBackups':
                    if (backupManager) {
                        const backups = backupManager.listBackups();
                        panel.webview.postMessage({
                            command: 'backupsList',
                            backups: backups
                        });
                    } else {
                        panel.webview.postMessage({
                            command: 'backupsList',
                            backups: [],
                            error: 'Sistema de backup não inicializado'
                        });
                    }
                    break;

                case 'restoreBackup':
                    const backupToRestore = message.backupName;
                    const targetPath = getDbPath();
                    
                    if (!targetPath) {
                        panel.webview.postMessage({
                            command: 'backupRestoreResult',
                            success: false,
                            error: 'Caminho do banco de dados não encontrado'
                        });
                        return;
                    }

                    if (backupManager) {
                        const success = backupManager.restoreBackup(backupToRestore, targetPath);
                        panel.webview.postMessage({
                            command: 'backupRestoreResult',
                            success: success,
                            message: success ? 'Backup restaurado com sucesso!' : 'Erro ao restaurar backup'
                        });
                        
                        if (success) {
                            try {
                                const dbContent = fs.readFileSync(targetPath, 'utf8');
                                const restoredDatabase = JSON.parse(dbContent);
                                panel.webview.postMessage({
                                    command: 'loadData',
                                    data: restoredDatabase
                                });
                            } catch (err) {
                                handleError(err, 'ERRO AO RECARREGAR DADOS APÓS RESTAURAÇÃO:');
                            }
                        }
                    } else {
                        panel.webview.postMessage({
                            command: 'backupRestoreResult',
                            success: false,
                            error: 'Sistema de backup não inicializado'
                        });
                    }
                    break;

                case 'createManualBackup':
                    const manualBackupPath = getDbPath();
                    if (!manualBackupPath) {
                        panel.webview.postMessage({
                            command: 'manualBackupResult',
                            success: false,
                            error: 'Caminho do banco de dados não encontrado'
                        });
                        return;
                    }

                    if (backupManager) {
                        const success = backupManager.createBackup(manualBackupPath);
                        panel.webview.postMessage({
                            command: 'manualBackupResult',
                            success: success,
                            message: success ? 'Backup manual criado com sucesso!' : 'Erro ao criar backup manual'
                        });
                    } else {
                        panel.webview.postMessage({
                            command: 'manualBackupResult',
                            success: false,
                            error: 'Sistema de backup não inicializado'
                        });
                    }
                    break;

                case 'generatePdfReport':
                    try {
                        // Recebendo comando generatePdfReport
                        const requestData = message.data;
                        
                        if (!requestData || !requestData.startDate || !requestData.endDate) {
                            throw new Error('Datas de início e fim são obrigatórias');
                        }
                        
                        // Lê os dados do SQLite
                        if (!databaseManager) {
                            throw new Error('DatabaseManager não inicializado');
                        }
                        
                        let databaseContent;
                        try {
                            databaseContent = await databaseManager.getAllData();
                        } catch (err) {
                            throw new Error('Erro ao ler dados do SQLite: ' + (err as Error).message);
                        }
                        
                        const reportData = {
                            startDate: requestData.startDate,
                            endDate: requestData.endDate,
                            assays: databaseContent.historicalAssays || [],
                            inventory: databaseContent.inventory || [],
                            timestamp: new Date().toISOString()
                        };
                        
                        // Dados do relatório carregados
                        
                        const pdfPath = await generatePdfReport(reportData, context.extensionPath);
                        
                        if (pdfPath) {
                            // Aguarda um pouco para garantir que o arquivo foi completamente escrito
                            await new Promise(resolve => setTimeout(resolve, 500));
                            
                            // Mostra notificação de sucesso no VS Code
                            const fileName = path.basename(pdfPath);
                            vscode.window.showInformationMessage(
                                `Relatório PDF gerado com sucesso: ${fileName}`,
                                'Abrir Pasta'
                            ).then(selection => {
                                if (selection === 'Abrir Pasta') {
                                    const pdfUri = vscode.Uri.file(pdfPath);
                                    vscode.commands.executeCommand('revealFileInOS', pdfUri);
                                }
                            });
                            
                            // Envia mensagem de sucesso para o webview
                            panel.webview.postMessage({
                                command: 'pdfReportGenerated',
                                success: true,
                                message: `Relatório PDF gerado com sucesso!\n\nArquivo salvo em: ${fileName}`,
                                path: pdfPath
                            });
                        } else {
                            panel.webview.postMessage({
                                command: 'pdfReportGenerated',
                                success: false,
                                message: 'Erro ao gerar relatório PDF'
                            });
                        }
                    } catch (err) {
                        console.error('ERRO CRÍTICO NA GERAÇÃO DO PDF:', err);
                        handleError(err, 'ERRO AO GERAR RELATÓRIO PDF:');
                        
                        let errorMessage = 'Erro interno ao gerar relatório PDF';
                        if (err instanceof Error) {
                            errorMessage = `Erro: ${err.message}`;
                        }
                        
                        panel.webview.postMessage({
                            command: 'pdfReportGenerated',
                            success: false,
                            message: errorMessage
                        });
                    }
                    break;

                case 'saveSystemUsers':
                    try {
                        if (!databaseManager) {
                            panel.webview.postMessage({
                                command: 'saveSystemUsersResult',
                                success: false,
                                error: 'DatabaseManager não inicializado'
                            });
                            return;
                        }
                        
                        // Obtém dados atuais
                        const database = await databaseManager.getAllData();
                        
                        // Atualiza os usuários do sistema
                        database.systemUsers = message.data.systemUsers;
                        
                        // Salva no SQLite
                        await databaseManager.saveData(database);
                        
                        panel.webview.postMessage({
                            command: 'saveSystemUsersResult',
                            success: true,
                            message: 'Usuários do sistema salvos com sucesso!'
                        });
                        
                        console.log('✅ Usuários do sistema salvos:', Object.keys(message.data.systemUsers));
                    } catch (err) {
                        handleError(err, 'ERRO AO SALVAR USUÁRIOS DO SISTEMA:');
                        panel.webview.postMessage({
                            command: 'saveSystemUsersResult',
                            success: false,
                            error: 'Erro ao salvar usuários do sistema'
                        });
                    }
                    break;                        
                case 'bulkDelete':
                    console.log('🔍 Processando comando bulkDelete no backend:', message.data);
                    try {
                        if (!databaseManager) {
                            panel.webview.postMessage({
                                command: 'bulkDeleteResult',
                                success: false,
                                error: 'DatabaseManager não inicializado'
                            });
                            return;
                        }
                        
                        // Verifica se o usuário é administrador
                        const systemUsername = process.env.USERNAME || process.env.USER || 'unknown';
                        const database = await databaseManager.getAllData();
                        const systemUsers = database.systemUsers || {};
                        const currentUser = systemUsers[systemUsername];
                        
                        if (!currentUser || currentUser.type !== 'administrador') {
                            panel.webview.postMessage({
                                command: 'bulkDeleteResult',
                                success: false,
                                error: 'Apenas administradores podem realizar exclusão em massa'
                            });
                            return;
                        }
                        
                        const { startDate, endDate } = message.data;
                        
                        if (!startDate || !endDate) {
                            panel.webview.postMessage({
                                command: 'bulkDeleteResult',
                                success: false,
                                error: 'Datas de início e fim são obrigatórias'
                            });
                            return;
                        }
                        
                        // Cria backup antes da exclusão
                        if (backupManager) {
                            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                            if (workspaceRoot) {
                                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                                const backupPath = path.join(workspaceRoot, '.labcontrol-backups', `database-backup-${timestamp}.sqlite`);
                                await databaseManager.createBackup(backupPath);
                            }
                        }
                        
                        // Filtra os dados removendo itens no período especificado
                        const start = new Date(startDate);
                        const end = new Date(endDate);
                        
                        const isInRange = (itemStartDate: string) => {
                            const itemDate = new Date(itemStartDate);
                            return itemDate >= start && itemDate <= end;
                        };
                        
                        // Conta itens antes da exclusão
                        const itemsToDelete = {
                            scheduledAssays: (database.scheduledAssays || []).filter((item: any) => isInRange(item.startDate)),
                            safetyScheduledAssays: (database.safetyScheduledAssays || []).filter((item: any) => isInRange(item.startDate)),
                            historicalAssays: (database.historicalAssays || []).filter((item: any) => isInRange(item.startDate)),
                            holidays: (database.holidays || []).filter((item: any) => isInRange(item.startDate)),
                            calibrations: (database.calibrations || []).filter((item: any) => isInRange(item.startDate))
                        };
                        
                        const totalItems = itemsToDelete.scheduledAssays.length + 
                                          itemsToDelete.safetyScheduledAssays.length + 
                                          itemsToDelete.historicalAssays.length + 
                                          itemsToDelete.holidays.length + 
                                          itemsToDelete.calibrations.length;
                        
                        // Remove os itens dos arrays
                        database.scheduledAssays = (database.scheduledAssays || []).filter((item: any) => !isInRange(item.startDate));
                        database.safetyScheduledAssays = (database.safetyScheduledAssays || []).filter((item: any) => !isInRange(item.startDate));
                        database.historicalAssays = (database.historicalAssays || []).filter((item: any) => !isInRange(item.startDate));
                        database.holidays = (database.holidays || []).filter((item: any) => !isInRange(item.startDate));
                        database.calibrations = (database.calibrations || []).filter((item: any) => !isInRange(item.startDate));
                        
                        // Salva no SQLite
                        await databaseManager.saveData(database);

                        const newStats = fs.statSync(dbPath);
                        lastDbUpdateTime = newStats.mtime.getTime()
                        
                        panel.webview.postMessage({
                            command: 'bulkDeleteResult',
                            success: true,
                            message: `Exclusão em massa concluída! ${totalItems} itens foram removidos do período de ${startDate} a ${endDate}.`,
                            itemsDeleted: totalItems
                        });
                        
                        // Exclusão em massa realizada
                        
                    } catch (err) {
                        handleError(err, 'ERRO AO REALIZAR EXCLUSÃO EM MASSA:');
                        panel.webview.postMessage({
                            command: 'bulkDeleteResult',
                            success: false,
                            error: 'Erro interno ao realizar exclusão em massa'
                        });
                    }
                    break;
            }
        });
        
        // Marca o comando como registrado após sucesso
        isCommandRegistered = true;
        console.log('✅ Comando registrado com sucesso');
        
    });
        
    } catch (error) {
        console.error('❌ Erro ao registrar comando:', error);
        vscode.window.showErrorMessage('Erro ao registrar comando da extensão. Tente recarregar o VS Code.');
        return;
    }

    context.subscriptions.push(disposable);

    // --- CLEANUP AO DESATIVAR A EXTENSÃO ---
    context.subscriptions.push({
        dispose: async () => {
            if (backupManager) {
                backupManager.stopAutoBackup();
            }
            if (databaseManager) {
                await databaseManager.close();
            }
        }
    });
}

/**
 * Monta e retorna o conteúdo HTML completo para o webview.
 */
function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const webviewPath = vscode.Uri.joinPath(extensionUri, 'webview');
    const stylesPath = vscode.Uri.joinPath(webviewPath, 'style.css');
    const scriptPath = vscode.Uri.joinPath(webviewPath, 'main.js');
    const htmlPath = vscode.Uri.joinPath(webviewPath, 'index.html');

    const iconPath = vscode.Uri.joinPath(extensionUri, 'images', 'icon.png');
    const iconUri = webview.asWebviewUri(iconPath);

    const wmGifPath = vscode.Uri.joinPath(extensionUri, 'images', 'wm.gif');
    const wmGifUri = webview.asWebviewUri(wmGifPath);
    
    const stylesUri = webview.asWebviewUri(stylesPath);
    const scriptUri = webview.asWebviewUri(scriptPath);

    const packageJsonPath = vscode.Uri.joinPath(extensionUri, 'package.json');
    const packageJsonContent = fs.readFileSync(packageJsonPath.fsPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);
    const version = packageJson.version;

    let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');

    htmlContent = htmlContent
        .replace('{{stylesUri}}', stylesUri.toString())
        .replace('{{scriptUri}}', scriptUri.toString())
        .replace('{{iconUri}}', iconUri.toString())
        .replace('{{version}}', version.toString())
        .replace('{{wmGifUri}}', wmGifUri.toString());

    return htmlContent;
}

/**
 * Função centralizada para tratamento de erros.
 */
function handleError(err: unknown, contextMessage: string) {
    let errorMessage = 'Ocorreu um erro desconhecido.';
    let errorDetails = '';
    let errorType = 'UnknownError';
    
    if (err instanceof Error) {
        errorType = err.constructor.name;
        errorMessage = `${contextMessage} ${err.message || 'Mensagem de erro não disponível'}`;
        
        // Adiciona detalhes específicos baseados no tipo de erro
        if (err.stack) {
            errorDetails = `\nStack trace: ${err.stack}`;
        }
        
        // Detalhes específicos para diferentes tipos de erro
        if (err instanceof TypeError) {
            errorDetails += `\nTipo de erro: Erro de tipo - verifique se os objetos/variáveis estão definidos corretamente.`;
            
            // Detalhes específicos para o erro "Cannot convert undefined or null to object"
            // Verificação segura para evitar erro de indexOf em message undefined
            if (err.message && typeof err.message === 'string' && err.message.includes('Cannot convert undefined or null to object')) {
                errorDetails += `\nEste erro geralmente ocorre quando Object.keys() é chamado em um valor null/undefined.`;
                errorDetails += `\nVerifique se todos os objetos estão sendo validados antes do uso.`;
            }
            
            // Verificação adicional para erro de indexOf
            if (err.message && typeof err.message === 'string' && err.message.includes('Cannot read properties of undefined')) {
                errorDetails += `\nEste erro ocorre quando uma propriedade é acessada em um valor undefined.`;
                errorDetails += `\nVerifique se todas as variáveis estão definidas antes de acessar suas propriedades.`;
            }
        } else if (err instanceof ReferenceError) {
            errorDetails += `\nTipo de erro: Erro de referência - uma variável não foi declarada ou está fora de escopo.`;
        } else if (err instanceof SyntaxError) {
            errorDetails += `\nTipo de erro: Erro de sintaxe - verifique a estrutura do código.`;
        }
        
        // Adiciona informações sobre propriedades específicas do erro
        const errorProps = Object.getOwnPropertyNames(err).filter(prop => 
            prop !== 'name' && prop !== 'message' && prop !== 'stack'
        );
        
        if (errorProps.length > 0) {
            errorDetails += `\nPropriedades adicionais: ${errorProps.map(prop => 
                `${prop}: ${(err as any)[prop]}`
            ).join(', ')}`;
        }
        
    } else if (typeof err === 'string') {
        errorMessage = `${contextMessage} ${err}`;
        errorType = 'StringError';
    } else if (typeof err === 'object' && err !== null) {
        errorType = 'ObjectError';
        errorMessage = `${contextMessage} ${JSON.stringify(err, null, 2)}`;
        errorDetails = `\nTipo de objeto: ${Object.prototype.toString.call(err)}`;
    }
    
    // Log detalhado no console
    console.group(`🚨 ${errorType}: ${contextMessage}`);
    console.error('Mensagem:', errorMessage);
    
    if (errorDetails) {
        console.error('Detalhes:', errorDetails);
    }
    
    console.error('Objeto de erro completo:', err);
    
    // Informações do ambiente
    console.info('Informações do ambiente:', {
        timestamp: new Date().toISOString(),
        platform: process.platform,
        nodeVersion: process.version
    });
    
    console.groupEnd();
    
    // Mostra notificação para o usuário
    vscode.window.showErrorMessage(
        `${errorType}: ${errorMessage}. Verifique o Console de Depuração.`,
        'Ver Console'
    ).then(selection => {
        if (selection === 'Ver Console') {
            vscode.commands.executeCommand('workbench.action.toggleDevTools');
        }
    });
}

export async function deactivate() {
    console.log('🔄 Desativando extensão Controle de Insumos...');
    
    // Para o sistema de backup automático
    if (backupManager) {
        backupManager.stopAutoBackup();
        backupManager = null;
        console.log('✅ Sistema de backup parado');
    }
    
    // Fecha a conexão com o banco de dados
    if (databaseManager) {
        await databaseManager.close();
        databaseManager = null;
        console.log('✅ Conexão com banco de dados fechada');
    }
    
    // Reseta a flag de comando registrado
    isCommandRegistered = false;
    
    // Limpa qualquer timer ou interval que possa estar rodando
    // (Isso é importante para evitar vazamentos de memória)
    
    console.log('✅ Extensão Controle de Insumos desativada com sucesso');
}