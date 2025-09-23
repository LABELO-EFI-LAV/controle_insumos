import * as sqlite3 from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { DataValidator, ValidationResult } from './DataValidator';
import { IncrementalBackup } from './IncrementalBackup';

export interface InventoryItem {
    id: number;
    reagent: string;
    manufacturer: string;
    lot: string;
    quantity: number;
    validity: string;
}

export interface AssayLot {
    lot: string;
    cycles: number;
    manufacturer?: string;
}

export interface AssayLots {
    poBase: AssayLot[];
    perborato: AssayLot[];
    taed: AssayLot[];
    tiras: AssayLot[];
}

export interface Assay {
    id: number;
    protocol: string;
    orcamento: string;
    assayManufacturer: string;
    model: string;
    nominalLoad: number;
    tensao: string;
    startDate: string;
    endDate: string;
    setup: number | string;
    status: string;
    type: string;
    observacoes: string;
    cycles: number;
    lots: AssayLots;
    report?: string;
    subRowIndex?: number;
    affectedTerminals?: string;
}

export interface Holiday {
    id: number;
    name: string;
    startDate: string;
    endDate: string;
}

export interface Calibration {
    id: number;
    protocol: string;
    startDate: string;
    endDate: string;
    type: string;
    status: string;
    affectedTerminals: string;
}

export interface Settings {
    notificationEmail: string;
    alertThreshold: number;
    schedulePassword?: string;
}

export interface SystemUser {
    username: string;
    type: string;
    displayName: string;
    permissions: {
        editHistory: boolean;
        addEditSupplies: boolean;
        accessSettings: boolean;
        editSchedule: boolean;
        dragAndDrop: boolean;
        editCompletedAssays: boolean;
        addAssays: boolean;
    };
}

export interface EfficiencyCategory {
    id: number;
    name: string;
}

export interface SafetyCategory {
    id: string;
    name: string;
}



export class DatabaseManager {
    private db: sqlite3.Database | null = null;
    private dbPath: string;
    private saveCount: number = 0;
    private incrementalBackup: IncrementalBackup;

    constructor(workspaceRoot: string) {
        this.dbPath = path.join(workspaceRoot, 'database.sqlite');
        this.incrementalBackup = new IncrementalBackup(workspaceRoot, {
            maxBackups: 50,
            maxAge: 30,
            compressionLevel: 6,
            incrementalThreshold: 10
        });
    }

    /**
     * Inicializa a conexão com o banco de dados SQLite
     */
    async initialize(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Erro ao conectar com SQLite:', err);
                    reject(err);
                } else {
                    // Conectado ao banco SQLite
                    
                    // Configurar melhorias de concorrência
                    this.configureConcurrency().then(() => {
                        this.createTables().then(resolve).catch(reject);
                    }).catch(reject);
                }
            });
        });
    }

    /**
     * Configura melhorias de concorrência do SQLite
     */
    private async configureConcurrency(): Promise<void> {
        if (!this.db) {
            throw new Error('Banco de dados não inicializado');
        }

        const db = this.db; // Salvar referência para usar no callback

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                // Habilitar WAL mode para melhor concorrência
                db.run("PRAGMA journal_mode=WAL;", (err) => {
                    if (err) {
                        console.error('❌ Erro ao configurar WAL mode:', err);
                    } else {
                        // WAL mode habilitado
                    }
                });

                // Configurar timeout para locks (5 segundos)
                db.run("PRAGMA busy_timeout=5000;", (err) => {
                    if (err) {
                        console.error('❌ Erro ao configurar busy_timeout:', err);
                    } else {
                        // Busy timeout configurado
                    }
                });

                // Configurar sincronização para melhor performance
                db.run("PRAGMA synchronous=NORMAL;", (err) => {
                    if (err) {
                        console.error('❌ Erro ao configurar synchronous:', err);
                    } else {
                        // Modo de sincronização configurado
                    }
                });

                // Configurar cache size para melhor performance
                db.run("PRAGMA cache_size=10000;", (err) => {
                    if (err) {
                        console.error('❌ Erro ao configurar cache_size:', err);
                        reject(err);
                    } else {
                        // Cache size configurado
                        resolve();
                    }
                });
            });
        });
    }

    /**
     * Cria todas as tabelas necessárias
     */
    private async createTables(): Promise<void> {
        const tables = [
            // Tabela de inventário
            `CREATE TABLE IF NOT EXISTS inventory (
                id INTEGER PRIMARY KEY,
                reagent TEXT NOT NULL,
                manufacturer TEXT NOT NULL,
                lot TEXT NOT NULL,
                quantity REAL NOT NULL,
                validity TEXT NOT NULL
            )`,

            // Tabela de ensaios históricos
            `CREATE TABLE IF NOT EXISTS historical_assays (
                id INTEGER PRIMARY KEY,
                protocol TEXT NOT NULL,
                orcamento TEXT,
                assay_manufacturer TEXT NOT NULL,
                model TEXT NOT NULL,
                nominal_load REAL NOT NULL,
                tensao TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                setup INTEGER NOT NULL,
                status TEXT NOT NULL,
                type TEXT NOT NULL,
                observacoes TEXT,
                cycles INTEGER,
                report TEXT,
                consumption TEXT,
                total_consumption REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Tabela de ensaios agendados
            `CREATE TABLE IF NOT EXISTS scheduled_assays (
                id INTEGER PRIMARY KEY,
                protocol TEXT NOT NULL,
                orcamento TEXT,
                assay_manufacturer TEXT NOT NULL,
                model TEXT NOT NULL,
                nominal_load REAL NOT NULL,
                tensao TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                setup INTEGER NOT NULL,
                status TEXT NOT NULL,
                type TEXT NOT NULL,
                observacoes TEXT,
                cycles INTEGER,
                planned_suppliers TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Tabela de ensaios de segurança agendados
            `CREATE TABLE IF NOT EXISTS safety_scheduled_assays (
                id INTEGER PRIMARY KEY,
                protocol TEXT NOT NULL,
                orcamento TEXT NOT NULL,
                assay_manufacturer TEXT NOT NULL,
                model TEXT NOT NULL,
                nominal_load REAL NOT NULL,
                tensao TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                setup TEXT NOT NULL,
                status TEXT NOT NULL,
                type TEXT NOT NULL,
                observacoes TEXT,
                cycles INTEGER,
                sub_row_index INTEGER
            )`,

            // Tabela de feriados
            `CREATE TABLE IF NOT EXISTS holidays (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL
            )`,

            // Tabela de calibrações
            `CREATE TABLE IF NOT EXISTS calibrations (
                id INTEGER PRIMARY KEY,
                protocol TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                affected_terminals TEXT NOT NULL
            )`,

            // Tabela de configurações
            `CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )`,

            // Tabela de usuários do sistema
            `CREATE TABLE IF NOT EXISTS system_users (
                username TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                display_name TEXT NOT NULL,
                permissions TEXT NOT NULL -- JSON string
            )`,

            // Tabela de equipamentos de calibração
            `CREATE TABLE IF NOT EXISTS calibration_equipments (
                id TEXT PRIMARY KEY,
                tag TEXT NOT NULL,
                equipment TEXT NOT NULL,
                validity TEXT NOT NULL,
                observations TEXT,
                calibration_status TEXT DEFAULT 'operacional',
                calibration_start_date TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Tabela de categorias de eficiência
            `CREATE TABLE IF NOT EXISTS efficiency_categories (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL
            )`,

            // Tabela de categorias de segurança
            `CREATE TABLE IF NOT EXISTS safety_categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Tabela de lotes de ensaios
            `CREATE TABLE IF NOT EXISTS assay_lots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                assay_id INTEGER NOT NULL,
                reagent_type TEXT NOT NULL,
                lot TEXT NOT NULL,
                cycles INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (assay_id) REFERENCES historical_assays (id)
            )`,


        ];

        for (const tableSQL of tables) {
            await this.runQuery(tableSQL);
        }

        // Todas as tabelas criadas/verificadas
        
        // Migração: Adicionar colunas de status de calibração se não existirem
        await this.migrateCalibrationStatusColumns();
        
        // Migração: Adicionar coluna planned_suppliers na tabela safety_scheduled_assays se não existir
        await this.migratePlannedSuppliersColumn();
        
        // Migração: Adicionar colunas de consumo na tabela historical_assays se não existirem
        await this.migrateConsumptionColumns();
    }

    /**
     * Migração para adicionar colunas de status de calibração
     */
    private async migrateCalibrationStatusColumns(): Promise<void> {
        try {
            // Iniciando migração das colunas de calibração
        
        // Verificar se as colunas já existem
        const tableInfo = await this.selectQuery('PRAGMA table_info(calibration_equipments)');
        
        const hasCalibrationStatus = Array.isArray(tableInfo) && tableInfo.some((col: any) => col.name === 'calibration_status');
        const hasCalibrationStartDate = Array.isArray(tableInfo) && tableInfo.some((col: any) => col.name === 'calibration_start_date');

            if (!hasCalibrationStatus) {
                await this.runQuery("ALTER TABLE calibration_equipments ADD COLUMN calibration_status TEXT DEFAULT 'disponivel'");
                // Coluna calibration_status adicionada
            }

            if (!hasCalibrationStartDate) {
                await this.runQuery("ALTER TABLE calibration_equipments ADD COLUMN calibration_start_date TEXT");
                // Coluna calibration_start_date adicionada
            }
            
            // Migração das colunas de calibração concluída
        } catch (error) {
            console.error('❌ Erro na migração das colunas de calibração:', error);
        }
    }

    /**
     * Migração para adicionar coluna planned_suppliers na tabela safety_scheduled_assays
     */
    private async migratePlannedSuppliersColumn(): Promise<void> {
        try {
            // Iniciando migração da coluna planned_suppliers
        
        // Verificar se a coluna já existe na tabela safety_scheduled_assays
        const tableInfo = await this.selectQuery("PRAGMA table_info(safety_scheduled_assays)");
            
            const hasPlannedSuppliers = tableInfo.some((col: any) => col.name === 'planned_suppliers');

            if (!hasPlannedSuppliers) {
                await this.runQuery("ALTER TABLE safety_scheduled_assays ADD COLUMN planned_suppliers TEXT");
                // Coluna planned_suppliers adicionada
            }

            // Migração da coluna planned_suppliers concluída
        } catch (error) {
            console.error('❌ Erro na migração da coluna planned_suppliers:', error);
        }
    }

    /**
     * Migração para adicionar colunas de consumo na tabela historical_assays
     */
    private async migrateConsumptionColumns(): Promise<void> {
        try {
            // Verificar se as colunas já existem
            const tableInfo = await this.selectQuery("PRAGMA table_info(historical_assays)");
            const hasConsumption = tableInfo.some((col: any) => col.name === 'consumption');
            const hasTotalConsumption = tableInfo.some((col: any) => col.name === 'total_consumption');
            
            if (!hasConsumption) {
                await this.runQuery('ALTER TABLE historical_assays ADD COLUMN consumption TEXT');
                console.log('✅ Coluna consumption adicionada à tabela historical_assays');
            }
            
            if (!hasTotalConsumption) {
                await this.runQuery('ALTER TABLE historical_assays ADD COLUMN total_consumption REAL');
                console.log('✅ Coluna total_consumo adicionada à tabela historical_assays');
            }
        } catch (error) {
            console.error('❌ Erro na migração das colunas de consumo:', error);
        }
    }

    /**
     * Executa uma query SQL
     */
    private async runQuery(sql: string, params: any[] = [], retryCount: number = 0): Promise<any> {
        if (!this.db) {
            throw new Error('Banco de dados não inicializado');
        }

        const maxRetries = 3;
        const retryDelay = 100; // 100ms
        const self = this; // Salvar referência para usar no callback

        return new Promise((resolve, reject) => {
            this.db!.run(sql, params, function(err) {
                if (err) {
                    // Verificar se é erro de lock e se ainda pode tentar novamente
                    const errorMessage = err.message || '';
                    if ((errorMessage.includes('SQLITE_BUSY') || errorMessage.includes('database is locked')) && retryCount < maxRetries) {
                        console.warn(`⚠️ Database busy, tentativa ${retryCount + 1}/${maxRetries + 1}:`, sql);
                        
                        // Aguardar um pouco antes de tentar novamente
                        setTimeout(() => {
                            self.runQuery(sql, params, retryCount + 1)
                                .then(resolve)
                                .catch(reject);
                        }, retryDelay * (retryCount + 1)); // Backoff exponencial
                    } else {
                        console.error('❌ Erro na query:', sql, err);
                        reject(err);
                    }
                } else {
                    if (retryCount > 0) {
                        console.log(`✅ Query executada com sucesso após ${retryCount + 1} tentativas`);
                    }
                    resolve({
                        lastID: this.lastID,
                        changes: this.changes
                    });
                }
            });
        });
    }

    /**
     * Executa uma query SELECT
     */
    private async selectQuery(sql: string, params: any[] = [], retryCount: number = 0): Promise<any[]> {
        if (!this.db) {
            throw new Error('Banco de dados não inicializado');
        }

        const maxRetries = 3;
        const retryDelay = 100; // 100ms

        return new Promise((resolve, reject) => {
            this.db!.all(sql, params, (err, rows) => {
                if (err) {
                    // Verificar se é erro de lock e se ainda pode tentar novamente
                    const errorMessage = err.message || '';
                    if ((errorMessage.includes('SQLITE_BUSY') || errorMessage.includes('database is locked')) && retryCount < maxRetries) {
                        console.warn(`⚠️ Database busy (SELECT), tentativa ${retryCount + 1}/${maxRetries + 1}:`, sql);
                        
                        // Aguardar um pouco antes de tentar novamente
                        setTimeout(() => {
                            this.selectQuery(sql, params, retryCount + 1)
                                .then(resolve)
                                .catch(reject);
                        }, retryDelay * (retryCount + 1)); // Backoff exponencial
                    } else {
                        console.error('❌ Erro na query SELECT:', sql, err);
                        reject(err);
                    }
                } else {
                    if (retryCount > 0) {
                        console.log(`✅ SELECT executado com sucesso após ${retryCount + 1} tentativas`);
                    }
                    resolve(rows || []);
                }
            });
        });
    }

    /**
     * Migra dados do database.json para SQLite
     */
    /**
     * Obtém todos os dados em formato compatível com o JSON original
     */
    async getAllData(): Promise<any> {
        // Iniciando carregamento de dados do banco
        const data: any = {};

        // Inventário
        data.inventory = await this.selectQuery('SELECT * FROM inventory ORDER BY id');

        // Ensaios históricos
        const historicalAssays = await this.selectQuery('SELECT * FROM historical_assays ORDER BY id');
        const assayLots = await this.selectQuery('SELECT DISTINCT assay_id, reagent_type, lot, cycles FROM assay_lots ORDER BY assay_id, reagent_type');
        
        // Agrupar lotes por assay_id
        const lotsByAssayId: { [key: number]: any } = {};
        for (const lot of assayLots) {
            if (!lotsByAssayId[lot.assay_id]) {
                lotsByAssayId[lot.assay_id] = {};
            }
            if (!lotsByAssayId[lot.assay_id][lot.reagent_type]) {
                lotsByAssayId[lot.assay_id][lot.reagent_type] = [];
            }
            
            // Verificar se já existe um lote idêntico antes de adicionar
            const existingLot = lotsByAssayId[lot.assay_id][lot.reagent_type].find(
                (existingLot: any) => existingLot.lot === lot.lot && existingLot.cycles === lot.cycles
            );
            
            if (!existingLot) {
                lotsByAssayId[lot.assay_id][lot.reagent_type].push({
                    lot: lot.lot,
                    cycles: lot.cycles
                });
            }
        }
        
        data.historicalAssays = historicalAssays.map(assay => ({
            ...assay,
            assayManufacturer: assay.assay_manufacturer,
            nominalLoad: assay.nominal_load,
            startDate: assay.start_date,
            endDate: assay.end_date,
            consumption: assay.consumption ? JSON.parse(assay.consumption) : null,
            totalConsumption: assay.total_consumo,
            lots: lotsByAssayId[assay.id] || {}
        }));

        // Ensaios agendados
        const scheduledAssays = await this.selectQuery('SELECT * FROM scheduled_assays ORDER BY id');
        data.scheduledAssays = scheduledAssays.map(assay => {
            let plannedSuppliers = null;
            if (assay.planned_suppliers) {
                try {
                    plannedSuppliers = JSON.parse(assay.planned_suppliers);
                } catch (error) {
                    console.warn(`Erro ao fazer parse do plannedSuppliers para ensaio ${assay.id}:`, error);
                    plannedSuppliers = null;
                }
            }
            
            return {
                ...assay,
                assayManufacturer: assay.assay_manufacturer,
                nominalLoad: assay.nominal_load,
                startDate: assay.start_date,
                endDate: assay.end_date,
                plannedSuppliers: plannedSuppliers
            };
        });

        // Ensaios de segurança agendados
        const safetyScheduledAssays = await this.selectQuery('SELECT * FROM safety_scheduled_assays ORDER BY id');
        data.safetyScheduledAssays = safetyScheduledAssays.map(assay => {
            let plannedSuppliers = null;
            if (assay.planned_suppliers) {
                try {
                    plannedSuppliers = JSON.parse(assay.planned_suppliers);
                } catch (error) {
                    console.warn(`Erro ao fazer parse do plannedSuppliers para ensaio de segurança ${assay.id}:`, error);
                    plannedSuppliers = null;
                }
            }
            
            return {
                ...assay,
                assayManufacturer: assay.assay_manufacturer,
                nominalLoad: assay.nominal_load,
                startDate: assay.start_date,
                endDate: assay.end_date,
                subRowIndex: assay.sub_row_index,
                plannedSuppliers: plannedSuppliers
            };
        });

        // Feriados
        const holidays = await this.selectQuery('SELECT * FROM holidays ORDER BY id');
        data.holidays = holidays.map(holiday => ({
            ...holiday,
            startDate: holiday.start_date,
            endDate: holiday.end_date
        }));

        // Calibrações
        const calibrations = await this.selectQuery('SELECT * FROM calibrations ORDER BY id');
        data.calibrations = calibrations.map(calibration => ({
            ...calibration,
            startDate: calibration.start_date,
            endDate: calibration.end_date,
            affectedTerminals: calibration.affected_terminals
        }));

        // Configurações
        const settingsRows = await this.selectQuery('SELECT * FROM settings');
        data.settings = {};
        for (const row of settingsRows) {
            try {
                data.settings[row.key] = JSON.parse(row.value);
            } catch {
                data.settings[row.key] = row.value;
            }
        }

        // Usuários do sistema
        const systemUsersRows = await this.selectQuery('SELECT * FROM system_users');
        data.systemUsers = {};
        for (const row of systemUsersRows) {
            data.systemUsers[row.username] = {
                username: row.username,
                type: row.type,
                displayName: row.display_name,
                permissions: JSON.parse(row.permissions)
            };
        }

        // Categorias de eficiência
        data.efficiencyCategories = await this.selectQuery('SELECT * FROM efficiency_categories ORDER BY id');

        // Categorias de segurança
        data.safetyCategories = await this.selectQuery('SELECT * FROM safety_categories ORDER BY id');

        // Equipamentos de calibração
        const calibrationEquipments = await this.selectQuery('SELECT * FROM calibration_equipments ORDER BY id');
        
        // Filtrar equipamentos em calibração
        const equipmentsInCalibrationFromDB = calibrationEquipments.filter((eq: any) => eq.calibration_status === 'em_calibracao');
        
        data.calibrationEquipments = calibrationEquipments.map(equipment => {
            const mapped = {
                ...equipment,
                calibrationStatus: equipment.calibration_status || 'disponivel',
                calibrationStartDate: equipment.calibration_start_date || null        
            };
            
            // Equipamento processado
            
            return mapped;
        });

        return data;
    }

    /**
     * Salva dados no banco SQLite
     */
    async saveData(data: any): Promise<void> {
        // Limpar dados existentes antes de inserir os novos para garantir sincronização
        if (data.inventory) {
            await this.runQuery('DELETE FROM inventory');
        }
        if (data.historicalAssays) {
            await this.runQuery('DELETE FROM assay_lots');
            await this.runQuery('DELETE FROM historical_assays');
        }
        if (data.scheduledAssays) {
            await this.runQuery('DELETE FROM scheduled_assays');
        }
        if (data.safetyScheduledAssays) {
            await this.runQuery('DELETE FROM safety_scheduled_assays');
        }
        if (data.calibrations) {
            await this.runQuery('DELETE FROM calibrations');
        }
        if (data.calibrationEquipments) {
            await this.runQuery('DELETE FROM calibration_equipments');
        }
        
        if (data.inventory) {
            for (const item of data.inventory) {
                // Tratar valores NULL/undefined para campos obrigatórios
                const safeReagent = item.reagent || 'Não especificado';
                const safeManufacturer = item.manufacturer || 'Não especificado';
                const safeLot = item.lot || 'Não especificado';
                const safeQuantity = item.quantity || 0;
                const safeValidity = item.validity || new Date().toISOString();
                
                await this.runQuery(
                    'INSERT OR REPLACE INTO inventory (id, reagent, manufacturer, lot, quantity, validity) VALUES (?, ?, ?, ?, ?, ?)',
                    [item.id, safeReagent, safeManufacturer, safeLot, safeQuantity, safeValidity]
                );
            }
        }

        if (data.historicalAssays) {
            for (const assay of data.historicalAssays) {
                // Tratar valores NULL/undefined para campos obrigatórios
                const safeProtocol = assay.protocol || 'Não especificado';
                const safeOrcamento = assay.orcamento || 'Não especificado';
                const safeAssayManufacturer = assay.assayManufacturer || 'Não especificado';
                const safeModel = assay.model || 'Não especificado';
                const safeNominalLoad = assay.nominalLoad || 0;
                const safeTensao = assay.tensao || 0;
                const safeStartDate = assay.startDate || new Date().toISOString();
                const safeEndDate = assay.endDate || new Date().toISOString();
                const safeSetup = assay.setup || 1;
                const safeStatus = assay.status || 'completed';
                const safeType = assay.type || 'efficiency';
                
                await this.runQuery(
                    'INSERT OR REPLACE INTO historical_assays (id, protocol, orcamento, assay_manufacturer, model, nominal_load, tensao, start_date, end_date, setup, status, type, observacoes, cycles, report, consumption, total_consumption) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [assay.id, safeProtocol, safeOrcamento, safeAssayManufacturer, safeModel, safeNominalLoad, safeTensao, safeStartDate, safeEndDate, safeSetup, safeStatus, safeType, assay.observacoes, assay.cycles, assay.report, JSON.stringify(assay.consumption) || null, assay.totalConsumption || null]
                );

                // Inserir lotes separadamente
                if (assay.lots) {
                    for (const [reagentType, lots] of Object.entries(assay.lots)) {
                        for (const lot of lots as any[]) {
                            // Verificar se o lote tem valores válidos antes de inserir
                            const safeLot = lot.lot || 'N/A';
                            const safeCycles = lot.cycles || 0;
                            
                            if (safeLot !== 'N/A') { // Só inserir se o lote for válido
                                await this.runQuery(
                                    'INSERT OR REPLACE INTO assay_lots (assay_id, reagent_type, lot, cycles) VALUES (?, ?, ?, ?)',
                                    [assay.id, reagentType, safeLot, safeCycles]
                                );
                            }
                        }
                    }
                }
            }
        }

        if (data.scheduledAssays) {
            for (const assay of data.scheduledAssays) {
                const safeProtocol = assay.protocol || 'Não especificado';
                const safeOrcamento = assay.orcamento || 'Não especificado';
                const safeAssayManufacturer = assay.assayManufacturer || 'Não especificado';
                const safeModel = assay.model || 'Não especificado';
                const safeNominalLoad = assay.nominalLoad || 0;
                const safeTensao = assay.tensao || 0;
                const safeStartDate = assay.startDate || new Date().toISOString();
                const safeEndDate = assay.endDate || new Date().toISOString();
                const safeSetup = assay.setup || 1;
                const safeStatus = assay.status || 'scheduled';
                const safeType = assay.type || 'efficiency';
                const safePlannedSuppliers = assay.plannedSuppliers || '';
                
                await this.runQuery(
                    'INSERT OR REPLACE INTO scheduled_assays (id, protocol, orcamento, assay_manufacturer, model, nominal_load, tensao, start_date, end_date, setup, status, type, observacoes, cycles, planned_suppliers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [assay.id, safeProtocol, safeOrcamento, safeAssayManufacturer, safeModel, safeNominalLoad, safeTensao, safeStartDate, safeEndDate, safeSetup, safeStatus, safeType, assay.observacoes, assay.cycles, safePlannedSuppliers]
                );
            }
        }

        if (data.safetyScheduledAssays) {
            for (const assay of data.safetyScheduledAssays) {
                const safeProtocol = assay.protocol || 'Não especificado';
                const safeOrcamento = assay.orcamento || 'Não especificado';
                const safeAssayManufacturer = assay.assayManufacturer || 'Não especificado';
                const safeModel = assay.model || 'Não especificado';
                const safeNominalLoad = assay.nominalLoad || 0;
                const safeTensao = assay.tensao || 0;
                const safeStartDate = assay.startDate || new Date().toISOString();
                const safeEndDate = assay.endDate || new Date().toISOString();
                const safeSetup = assay.setup || 1;
                const safeStatus = assay.status || 'scheduled';
                const safeType = assay.type || 'safety';
                const safePlannedSuppliers = assay.plannedSuppliers || '';
                
                const safeSubRowIndex = assay.subRowIndex || assay.sub_row_index || 0;
                
                await this.runQuery(
                    'INSERT OR REPLACE INTO safety_scheduled_assays (id, protocol, orcamento, assay_manufacturer, model, nominal_load, tensao, start_date, end_date, setup, status, type, observacoes, cycles, sub_row_index, planned_suppliers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [assay.id, safeProtocol, safeOrcamento, safeAssayManufacturer, safeModel, safeNominalLoad, safeTensao, safeStartDate, safeEndDate, safeSetup, safeStatus, safeType, assay.observacoes, assay.cycles, safeSubRowIndex, safePlannedSuppliers]
                );
            }
        }

        if (data.calibrations) {
            for (const calibration of data.calibrations) {
                const safeProtocol = calibration.equipment || calibration.protocol || 'Não especificado';
                const safeStartDate = calibration.startDate || new Date().toISOString();
                const safeEndDate = calibration.endDate || new Date().toISOString();
                const safeType = calibration.type || 'calibration';
                const safeStatus = calibration.status || 'scheduled';
                const safeAffectedTerminals = calibration.observacoes || calibration.affected_terminals || '';
                
                await this.runQuery(
                    'INSERT OR REPLACE INTO calibrations (id, protocol, start_date, end_date, type, status, affected_terminals) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [calibration.id, safeProtocol, safeStartDate, safeEndDate, safeType, safeStatus, safeAffectedTerminals]
                );
            }
        }

        if (data.holidays) {
            for (const holiday of data.holidays) {
                const safeName = holiday.name || 'Feriado';
                const safeStartDate = holiday.startDate || holiday.date || new Date().toISOString();
                const safeEndDate = holiday.endDate || holiday.date || new Date().toISOString();
                
                await this.runQuery(
                    'INSERT OR REPLACE INTO holidays (id, name, start_date, end_date) VALUES (?, ?, ?, ?)',
                    [holiday.id, safeName, safeStartDate, safeEndDate]
                );
            }
        }

        if (data.settings) {
            for (const [key, value] of Object.entries(data.settings)) {
                await this.runQuery(
                    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
                    [key, JSON.stringify(value)]
                );
            }
        }

        if (data.efficiencyCategories) {
            for (const category of data.efficiencyCategories) {
                const safeName = category.name || 'Categoria';
                
                await this.runQuery(
                    'INSERT OR REPLACE INTO efficiency_categories (id, name) VALUES (?, ?)',
                    [category.id, safeName]
                );
            }
        }

        if (data.safetyCategories) {
            for (const category of data.safetyCategories) {
                const safeName = category.name || 'Categoria';
                
                await this.runQuery(
                    'INSERT OR REPLACE INTO safety_categories (id, name) VALUES (?, ?)',
                    [category.id, safeName]
                );
            }
        }

        if (data.calibrationEquipments) {
            console.log('🔧 Salvando equipamentos de calibração:', data.calibrationEquipments.length);
            
            // Filtrar equipamentos em calibração
            const equipmentsInCalibration = data.calibrationEquipments.filter((eq: any) => eq.calibrationStatus === 'em_calibracao');
            
            for (const equipment of data.calibrationEquipments) {
                const safeTag = equipment.tag || equipment.name || 'TAG-' + equipment.id;
                const safeEquipment = equipment.equipment || equipment.name || 'Equipamento';
                const safeValidity = equipment.validity || '';
                const safeObservations = equipment.observations || '';
                const safeCalibrationStatus = equipment.calibrationStatus || 'disponivel';
                const safeCalibrationStartDate = equipment.calibrationStartDate || null;
                
                // Processando equipamento
                
                await this.runQuery(
                    'INSERT OR REPLACE INTO calibration_equipments (id, tag, equipment, validity, observations, calibration_status, calibration_start_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [equipment.id, safeTag, safeEquipment, safeValidity, safeObservations, safeCalibrationStatus, safeCalibrationStartDate]
                );
            }
        }

        // VACUUM automático a cada 10 salvamentos para compactar o banco
        this.saveCount = (this.saveCount || 0) + 1;
        if (this.saveCount % 10 === 0) {
            await this.runQuery('VACUUM');
        }

        if (data.systemUsers) {
            await this.runQuery('DELETE FROM system_users');
            for (const [userId, userData] of Object.entries(data.systemUsers)) {
                const user = userData as any;
                const safeType = user.type || 'user';
                const safeDisplayName = user.display_name || user.displayName || userId;
                const safePermissions = user.permissions || '[]';
                
                await this.runQuery(
                    'INSERT OR REPLACE INTO system_users (username, type, display_name, permissions) VALUES (?, ?, ?, ?)',
                    [userId, safeType, safeDisplayName, JSON.stringify(safePermissions)]
                );
            }
        }
    }

    /**
     * Fecha a conexão com o banco de dados
     */
    async close(): Promise<void> {
        if (this.db) {
            return new Promise((resolve, reject) => {
                this.db!.close((err) => {
                    if (err) {
                        console.error('Erro ao fechar banco de dados:', err);
                        reject(err);
                    } else {
                        console.log('✅ Conexão com banco de dados fechada');
                        this.db = null;
                        resolve();
                    }
                });
            });
        }
    }

    /**
     * Cria backup do banco SQLite
     */
    async createBackup(backupPath: string): Promise<boolean> {
        try {
            if (fs.existsSync(this.dbPath)) {
                fs.copyFileSync(this.dbPath, backupPath);
                console.log(`✅ Backup SQLite criado: ${backupPath}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('❌ Erro ao criar backup SQLite:', error);
            return false;
        }
    }

    /**
     * Atualiza apenas o status de um ensaio específico (muito mais eficiente)
     */
    async updateAssayStatus(assayId: number, status: string, table: 'scheduled_assays' | 'safety_scheduled_assays' = 'scheduled_assays'): Promise<void> {
        await this.runQuery(
            `UPDATE ${table} SET status = ? WHERE id = ?`,
            [status, assayId]
        );
    }

    /**
     * Atualiza múltiplos campos de um ensaio específico
     */
    async updateAssay(assayId: number, updates: any, table: 'scheduled_assays' | 'safety_scheduled_assays' = 'scheduled_assays'): Promise<void> {
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        
        await this.runQuery(
            `UPDATE ${table} SET ${setClause} WHERE id = ?`,
            [...values, assayId]
        );
    }

    /**
     * Adiciona um novo item ao inventário (operação otimizada com validação robusta e backup incremental)
     */
    async addInventoryItem(item: Omit<InventoryItem, 'id'>): Promise<number> {
        // Validação robusta usando DataValidator
        const validation = DataValidator.validateInventoryItem(item);
        
        if (!validation.isValid) {
            throw new Error(`Dados inválidos: ${validation.errors.join(', ')}`);
        }

        // Verificar se os dados sanitizados estão disponíveis
        if (!validation.sanitizedData) {
            throw new Error('Erro interno: dados sanitizados não disponíveis após validação bem-sucedida');
        }

        // Usar dados sanitizados
        const sanitizedItem = validation.sanitizedData;

        // Inserindo item validado e sanitizado

        const result = await this.runQuery(
            `INSERT INTO inventory (reagent, manufacturer, lot, quantity, validity) 
             VALUES (?, ?, ?, ?, ?)`,
            [sanitizedItem.reagent, sanitizedItem.manufacturer, sanitizedItem.lot, sanitizedItem.quantity, sanitizedItem.validity]
        );

        // Log da mudança para backup incremental
        this.incrementalBackup.logChange('inventory', 'INSERT', result.lastID, undefined, { ...sanitizedItem, id: result.lastID });

        return result.lastID;
    }

    /**
     * Atualiza um item do inventário (operação otimizada com validação e backup incremental)
     */
    async updateInventoryItem(id: number, updates: Partial<Omit<InventoryItem, 'id'>>): Promise<void> {
        // Obter dados antigos para o log de mudanças
        const oldData = await this.selectQuery(`SELECT * FROM inventory WHERE id = ?`, [id]);
        const oldItem = oldData[0];

        // Validar dados de atualização
        const validation = DataValidator.validateInventoryItem({ ...updates, id: 0 } as any);
        
        if (!validation.isValid) {
            // Filtrar apenas erros relevantes para campos sendo atualizados
            const relevantErrors = validation.errors.filter(error => 
                Object.keys(updates).some(field => error.includes(field))
            );
            if (relevantErrors.length > 0) {
                throw new Error(`Dados inválidos: ${relevantErrors.join(', ')}`);
            }
        }

        // Verificar se sanitizedData existe antes de usar
        if (!validation.sanitizedData) {
            throw new Error('Dados sanitizados não disponíveis após validação');
        }

        // Usar dados sanitizados
        const sanitizedUpdates = validation.sanitizedData;
        const updateFields = Object.keys(updates);
        const sanitizedValues = updateFields.map(field => sanitizedUpdates[field]);
        
        const setClause = updateFields.map(field => `${field} = ?`).join(', ');
        
        await this.runQuery(
            `UPDATE inventory SET ${setClause} WHERE id = ?`,
            [...sanitizedValues, id]
        );

        // Log da mudança para backup incremental
        const newItem = { ...oldItem, ...sanitizedUpdates };
        this.incrementalBackup.logChange('inventory', 'UPDATE', id, oldItem, newItem);
    }

    /**
     * Remove um item do inventário (operação otimizada com backup incremental)
     */
    async deleteInventoryItem(id: number): Promise<void> {
        // Obter dados antes da exclusão para o log de mudanças
        const oldData = await this.selectQuery(`SELECT * FROM inventory WHERE id = ?`, [id]);
        const oldItem = oldData[0];

        await this.runQuery(`DELETE FROM inventory WHERE id = ?`, [id]);

        // Log da mudança para backup incremental
        if (oldItem) {
            this.incrementalBackup.logChange('inventory', 'DELETE', id, oldItem, undefined);
        }
    }

    /**
     * Adiciona um novo feriado (operação otimizada com validação)
     */
    async addHoliday(holiday: Omit<Holiday, 'id'>): Promise<number> {
        console.log('DEBUG DatabaseManager addHoliday - dados recebidos:', holiday, 'tipo:', typeof holiday);
        // Validação robusta usando DataValidator
        const validation = DataValidator.validateHoliday(holiday);
        
        if (!validation.isValid) {
            throw new Error(`Dados inválidos: ${validation.errors.join(', ')}`);
        }

        // Verificar se os dados sanitizados estão disponíveis
        if (!validation.sanitizedData) {
            throw new Error('Erro interno: dados sanitizados não disponíveis após validação bem-sucedida');
        }

        // Usar dados sanitizados
        const sanitizedHoliday = validation.sanitizedData;
        
        const result = await this.runQuery(
            `INSERT INTO holidays (name, start_date, end_date) VALUES (?, ?, ?)`,
            [sanitizedHoliday.name, sanitizedHoliday.startDate, sanitizedHoliday.endDate]
        );
        return result.lastID;
    }

    /**
     * Remove um feriado (operação otimizada)
     */
    async deleteHoliday(id: number): Promise<void> {
        await this.runQuery(`DELETE FROM holidays WHERE id = ?`, [id]);
    }

    /**
     * Adiciona um novo usuário do sistema (operação otimizada com validação)
     */
    async addSystemUser(user: any): Promise<string> {
        // Validação robusta usando DataValidator
        const validation = DataValidator.validateUser(user);
        
        if (!validation.isValid) {
            throw new Error(`Dados inválidos: ${validation.errors.join(', ')}`);
        }

        // Verificar se os dados sanitizados estão disponíveis
        if (!validation.sanitizedData) {
            throw new Error('Erro interno: dados sanitizados não disponíveis após validação bem-sucedida');
        }

        // Usar dados sanitizados
        const sanitizedUser = validation.sanitizedData;
        
        const result = await this.runQuery(
            `INSERT INTO system_users (username, type, display_name, permissions) VALUES (?, ?, ?, ?)`,
            [sanitizedUser.username, sanitizedUser.type, sanitizedUser.displayName, JSON.stringify(user.permissions)]
        );
        return sanitizedUser.username; // Retorna o username como ID
    }

    /**
     * Atualiza um usuário do sistema (operação otimizada)
     */
    async updateSystemUser(username: string, updates: any): Promise<void> {
        const fields = Object.keys(updates);
        const values = Object.values(updates).map(value => 
            typeof value === 'object' ? JSON.stringify(value) : value
        );
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        
        await this.runQuery(
            `UPDATE system_users SET ${setClause} WHERE username = ?`,
            [...values, username]
        );
    }

    /**
     * Remove um usuário do sistema (operação otimizada)
     */
    async deleteSystemUser(username: string): Promise<void> {
        await this.runQuery(`DELETE FROM system_users WHERE username = ?`, [username]);
    }

    /**
     * Adiciona uma nova categoria (linha) ao cronograma (operação otimizada)
     */
    async addCategory(category: any, isSafety: boolean = false): Promise<number> {
        const table = isSafety ? 'safety_categories' : 'efficiency_categories';
        const result = await this.runQuery(
            `INSERT INTO ${table} (name) VALUES (?)`,
            [category.name]
        );
        return result.lastID;
    }

    /**
     * Remove uma categoria (linha) do cronograma (operação otimizada)
     */
    async deleteCategory(id: number, isSafety: boolean = false): Promise<void> {
        const table = isSafety ? 'safety_categories' : 'efficiency_categories';
        await this.runQuery(`DELETE FROM ${table} WHERE id = ?`, [id]);
    }

    /**
     * Atualiza configurações do sistema (operação otimizada com validação)
     */
    async updateSettings(settings: any): Promise<void> {
        // Validação robusta usando DataValidator
        const validation = DataValidator.validateSettings(settings);
        
        if (!validation.isValid) {
            throw new Error(`Configurações inválidas: ${validation.errors.join(', ')}`);
        }

        // Verificar se sanitizedData existe antes de usar
        if (!validation.sanitizedData) {
            throw new Error('Dados sanitizados não disponíveis após validação');
        }

        // Usar dados sanitizados
        const sanitizedSettings = validation.sanitizedData;
        
        // Atualiza apenas os campos específicos das configurações sanitizadas
        const updates = Object.keys(sanitizedSettings).map(key => 
            `UPDATE settings SET value = ? WHERE key = ?`
        );
        
        for (let i = 0; i < updates.length; i++) {
            const key = Object.keys(sanitizedSettings)[i];
            const value = typeof sanitizedSettings[key] === 'object' ? 
                JSON.stringify(sanitizedSettings[key]) : sanitizedSettings[key];
            await this.runQuery(updates[i], [value, key]);
        }
    }

    /**
     * Restaura backup do banco SQLite
     */
    async restoreBackup(backupPath: string): Promise<boolean> {
        try {
            if (fs.existsSync(backupPath)) {
                // Fecha conexão atual
                await this.close();
                
                // Copia backup
                fs.copyFileSync(backupPath, this.dbPath);
                
                // Reconecta
                await this.initialize();
                
                console.log(`✅ Backup SQLite restaurado: ${backupPath}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('❌ Erro ao restaurar backup SQLite:', error);
            return false;
        }
    }

    // ===== MÉTODOS DE BACKUP INCREMENTAL =====

    /**
     * Cria backup completo dos dados
     */
    async createFullIncrementalBackup(): Promise<string> {
        try {
            const allData = await this.getAllData();
            return await this.incrementalBackup.createFullBackup(allData);
        } catch (error) {
            console.error('[BACKUP] Erro ao criar backup completo:', error);
            throw error;
        }
    }

    /**
     * Cria backup incremental das mudanças
     */
    async createIncrementalBackup(): Promise<string> {
        try {
            return await this.incrementalBackup.createIncrementalBackup();
        } catch (error) {
            console.error('[BACKUP] Erro ao criar backup incremental:', error);
            throw error;
        }
    }

    /**
     * Lista todos os backups disponíveis
     */
    getBackupList(): any[] {
        return this.incrementalBackup.listBackups();
    }

    /**
     * Obtém estatísticas dos backups
     */
    getBackupStats(): any {
        return this.incrementalBackup.getBackupStats();
    }

    /**
     * Executa limpeza automática de backups antigos
     */
    async cleanupOldBackups(): Promise<void> {
        try {
            await this.incrementalBackup.cleanupOldBackups();
        } catch (error) {
            console.error('[BACKUP] Erro na limpeza de backups:', error);
            throw error;
        }
    }

    /**
     * Restaura backup incremental (apenas para dados JSON)
     */
    async restoreIncrementalBackup(backupPath: string): Promise<any> {
        try {
            return await this.incrementalBackup.restoreBackup(backupPath);
        } catch (error) {
            console.error('[BACKUP] Erro ao restaurar backup incremental:', error);
            throw error;
        }
    }

}