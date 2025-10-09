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
    reportDate?: string;
    plannedSuppliers?: string;
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

export interface EquipmentCalibration {
    id: number;
    equipmentName: string;
    calibrationDate: string;
    nextCalibrationDate: string;
    status: string;
    certificateNumber?: string;
    calibratedBy?: string;
    notes?: string;
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
    private roDb: sqlite3.Database | null = null;
    private dbPath: string;
    private saveCount: number = 0;
    private incrementalBackup: IncrementalBackup;
    private operationQueue: Promise<any> = Promise.resolve();
    private activeOperations: number = 0;
    private maxConcurrentOperations: number = 3;
    private vacuumTimer: NodeJS.Timeout | null = null;
    private vacuumDelayMs: number = 30000; // 30s de inatividade antes de VACUUM
    private enableAutoVacuum: boolean = false; // Flag para desativar VACUUM automático por padrão
    private fullSyncMode: boolean = false; // Flag para escolher entre sincronização completa ou por delta
    private networkMode: boolean = true; // Quando true, usa PRAGMAs seguros para rede (journal DELETE)
    private initBusy: boolean = false; // Marca se encontrou SQLITE_BUSY/locked na inicialização
    // Estado para checkpoints WAL
    private transactionDepth: number = 0; // Suprime checkpoints automáticos durante transações
    private writesSinceCheckpoint: number = 0; // Número de escritas desde último checkpoint
    private lastCheckpointTime: number = 0; // Timestamp do último checkpoint
    private checkpointMinIntervalMs: number = 2000; // Intervalo mínimo entre checkpoints automáticos
    private checkpointWriteThreshold: number = 20; // Checkpoint após N escritas
    private walSizeThresholdBytes: number = 512 * 1024; // Checkpoint se WAL exceder 512KB

    constructor(workspaceRoot: string) {
        this.dbPath = path.join(workspaceRoot, 'database.sqlite');
        this.incrementalBackup = new IncrementalBackup(workspaceRoot, {
            maxBackups: 30,
            maxAge: 30,
            compressionLevel: 6,
            incrementalThreshold: 10
        });
    }

    wasBusyOnInit(): boolean {
        return this.initBusy;
    }

    /**
     * Habilita ou desabilita o VACUUM automático durante períodos de inatividade.
     * Quando desabilitado, cancela qualquer VACUUM já agendado.
     */
    setAutoVacuum(enable: boolean): void {
        this.enableAutoVacuum = enable;
        if (!enable && this.vacuumTimer) {
            clearTimeout(this.vacuumTimer);
            this.vacuumTimer = null;
        }
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
                    
                    // Abre conexão somente leitura para SELECTs
                    this.roDb = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY, (roErr) => {
                        if (roErr) {
                            console.warn('⚠️ Falha ao abrir conexão somente leitura. SELECTs usarão conexão principal.', roErr);
                            this.roDb = null;
                        } else {
                            // Conexão RO aberta
                            // Configurar timeout para locks também na conexão somente leitura
                            this.roDb!.run("PRAGMA busy_timeout=10000;", (busyErr) => {
                                if (busyErr) {
                                    const msg = String(busyErr?.message || '').toLowerCase();
                                    if (msg.includes('busy') || msg.includes('locked')) {
                                        this.initBusy = true;
                                        console.warn('⚠️ Banco ocupado ao configurar busy_timeout (RO); mantendo padrão.');
                                    } else {
                                        console.error('❌ Erro ao configurar busy_timeout na conexão RO:', busyErr);
                                    }
                                } else {
                                    console.log('✅ Busy timeout configurado para 10s na conexão RO');
                                }
                                // Em modo rede, desativar mmap na conexão somente leitura
                                if (this.networkMode) {
                                    this.roDb!.run("PRAGMA mmap_size=0;", (mmErr) => {
                                        if (mmErr) {
                                            console.warn('⚠️ Falha ao desativar mmap_size na conexão RO:', mmErr);
                                        } else {
                                            console.log('✅ mmap_size=0 aplicado na conexão RO (modo rede)');
                                        }
                                    });
                                }
                            });
                        }
                    });

                    // Configurar melhorias de concorrência
                    this.configureConcurrency().then(() => {
                        this.createTables().then(() => {
                            // Criar índices para melhorar performance
                            this.createIndexes().then(resolve).catch(reject);
                        }).catch(reject);
                    }).catch((e) => {
                        // Se falhar por busy/locked, marcar e seguir
                        const msg = String(e?.message || '').toLowerCase();
                        if (msg.includes('busy') || msg.includes('locked')) {
                            this.initBusy = true;
                            console.warn('⚠️ Banco ocupado ao configurar concorrência; seguindo com padrões.');
                            this.createTables().then(() => {
                                this.createIndexes().then(resolve).catch(reject);
                            }).catch(reject);
                        } else {
                            reject(e);
                        }
                    });
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
                // Se estiver em modo rede, preferir journal_mode=DELETE e suprimir lógica de WAL
                if (this.networkMode) {
                    db.run("PRAGMA journal_mode=DELETE;", (jmErr) => {
                        if (jmErr) {
                            const msg = String(jmErr?.message || '').toLowerCase();
                            if (msg.includes('busy') || msg.includes('locked')) {
                                this.initBusy = true;
                                console.warn('⚠️ Banco ocupado ao configurar DELETE journal; seguindo sem alterar.');
                            } else {
                                console.error('❌ Erro ao configurar DELETE journal_mode:', jmErr);
                            }
                        } else {
                            console.log('✅ journal_mode=DELETE habilitado (modo rede)');
                        }

                        // busy_timeout para evitar bloqueios longos
                        db.run("PRAGMA busy_timeout=10000;", (btErr) => {
                            if (btErr) {
                                const msg = String(btErr?.message || '').toLowerCase();
                                if (msg.includes('busy') || msg.includes('locked')) {
                                    this.initBusy = true;
                                    console.warn('⚠️ Banco ocupado ao configurar busy_timeout; mantendo padrão.');
                                } else {
                                    console.error('❌ Erro ao configurar busy_timeout:', btErr);
                                }
                            } else {
                                console.log('✅ Busy timeout configurado para 10s');
                            }

                            // Sincronização FULL para maior durabilidade em rede
                            db.run("PRAGMA synchronous=FULL;", (syncErr) => {
                                if (syncErr) {
                                    const raw = syncErr?.message || '';
                                    const msg = raw.toLowerCase();
                                    const isBusy = msg.includes('busy') || msg.includes('locked') || raw.includes('SQLITE_BUSY') || raw.includes('database is locked');
                                    if (isBusy) {
                                        this.initBusy = true;
                                        console.warn('⚠️ Banco ocupado ao configurar synchronous; mantendo configuração atual.', syncErr);
                                    } else {
                                        console.warn('⚠️ Aviso ao configurar synchronous (não crítico):', syncErr);
                                    }
                                } else {
                                    console.log('✅ Modo de sincronização FULL configurado');
                                }

                                // Demais ajustes de performance (idênticos entre modos)
                                db.run("PRAGMA cache_size=20000;", (csErr) => {
                                    if (csErr) {
                                        const msg = String(csErr?.message || '').toLowerCase();
                                        if (msg.includes('busy') || msg.includes('locked')) {
                                            this.initBusy = true;
                                            console.warn('⚠️ Banco ocupado ao configurar cache_size; mantendo configuração atual.');
                                        } else {
                                            console.error('❌ Erro ao configurar cache_size:', csErr);
                                        }
                                    } else {
                                        console.log('✅ Cache size configurado para 20MB');
                                    }

                                    db.run("PRAGMA temp_store=MEMORY;", (tsErr) => {
                                        if (tsErr) {
                                            const msg = String(tsErr?.message || '').toLowerCase();
                                            if (msg.includes('busy') || msg.includes('locked')) {
                                                this.initBusy = true;
                                                console.warn('⚠️ Banco ocupado ao configurar temp_store; mantendo configuração atual.');
                                            } else {
                                                console.error('❌ Erro ao configurar temp_store:', tsErr);
                                            }
                                        } else {
                                            console.log('✅ Temp store configurado para memória');
                                        }

                                        db.run("PRAGMA mmap_size=0;", (mmErr) => {
                                            if (mmErr) {
                                                const msg = String(mmErr?.message || '').toLowerCase();
                                                if (msg.includes('busy') || msg.includes('locked')) {
                                                    this.initBusy = true;
                                                    console.warn('⚠️ Banco ocupado ao configurar mmap_size; mantendo configuração atual.');
                                                } else {
                                                    console.error('❌ Erro ao configurar mmap_size:', mmErr);
                                                }
                                            } else {
                                                console.log('✅ Memory-mapped I/O desativado (mmap_size=0) em modo rede');
                                            }
                                            // Finaliza configuração em modo rede
                                            resolve();
                                        });
                                    });
                                });
                            });
                        });
                    });
                    return; // evitar executar bloco de WAL abaixo
                }
                // Habilitar WAL mode para melhor concorrência
                db.run("PRAGMA journal_mode=WAL;", (err) => {
                    if (err) {
                        const msg = String(err?.message || '').toLowerCase();
                        if (msg.includes('busy') || msg.includes('locked')) {
                            this.initBusy = true;
                            console.warn('⚠️ Banco ocupado ao configurar WAL; seguindo sem alterar.');
                        } else {
                            console.error('❌ Erro ao configurar WAL mode:', err);
                        }
                    } else {
                        console.log('✅ WAL mode habilitado');
                    }
                });

                // Configurar timeout para locks (10 segundos)
                db.run("PRAGMA busy_timeout=10000;", (err) => {
                    if (err) {
                        const msg = String(err?.message || '').toLowerCase();
                        if (msg.includes('busy') || msg.includes('locked')) {
                            this.initBusy = true;
                            console.warn('⚠️ Banco ocupado ao configurar busy_timeout; mantendo padrão.');
                        } else {
                            console.error('❌ Erro ao configurar busy_timeout:', err);
                        }
                    } else {
                        console.log('✅ Busy timeout configurado para 10s');
                    }
                });

                // Configurar sincronização para maior durabilidade em ambientes compartilhados
                // FULL força flush mais agressivo, melhorando visibilidade entre máquinas em rede
                db.run("PRAGMA synchronous=FULL;", (err) => {
                    if (err) {
                        const raw = err?.message || '';
                        const msg = raw.toLowerCase();
                        const isBusy = msg.includes('busy') || msg.includes('locked') || raw.includes('SQLITE_BUSY') || raw.includes('database is locked');
                        if (isBusy) {
                            this.initBusy = true;
                            console.warn('⚠️ Banco ocupado ao configurar synchronous; mantendo configuração atual.', err);
                            return;
                        }
                        // Outros erros de PRAGMA synchronous não devem travar inicialização
                        console.warn('⚠️ Aviso ao configurar synchronous (não crítico):', err);
                    } else {
                        console.log('✅ Modo de sincronização FULL configurado');
                    }
                });

                // Configurar cache size maior para melhor performance (20MB)
                db.run("PRAGMA cache_size=20000;", (err) => {
                    if (err) {
                        const msg = String(err?.message || '').toLowerCase();
                        if (msg.includes('busy') || msg.includes('locked')) {
                            this.initBusy = true;
                            console.warn('⚠️ Banco ocupado ao configurar cache_size; mantendo configuração atual.');
                        } else {
                            console.error('❌ Erro ao configurar cache_size:', err);
                        }
                    } else {
                        console.log('✅ Cache size configurado para 20MB');
                    }
                });

                // Configurar temp_store para usar memória
                db.run("PRAGMA temp_store=MEMORY;", (err) => {
                    if (err) {
                        const msg = String(err?.message || '').toLowerCase();
                        if (msg.includes('busy') || msg.includes('locked')) {
                            this.initBusy = true;
                            console.warn('⚠️ Banco ocupado ao configurar temp_store; mantendo configuração atual.');
                        } else {
                            console.error('❌ Erro ao configurar temp_store:', err);
                        }
                    } else {
                        console.log('✅ Temp store configurado para memória');
                    }
                });

                // Configurar mmap_size para melhor I/O (256MB) apenas quando não estiver em modo rede
                db.run(`PRAGMA mmap_size=${this.networkMode ? 0 : 268435456};`, (err) => {
                    if (err) {
                        const msg = String(err?.message || '').toLowerCase();
                        if (msg.includes('busy') || msg.includes('locked')) {
                            this.initBusy = true;
                            console.warn('⚠️ Banco ocupado ao configurar mmap_size; mantendo configuração atual.');
                        } else {
                            console.error('❌ Erro ao configurar mmap_size:', err);
                        }
                    } else {
                        console.log(`✅ mmap_size configurado para ${this.networkMode ? '0 (desativado em rede)' : '256MB'}`);
                    }
                });

                // Configurar WAL autocheckpoint para controlar o tamanho do WAL
                // Reduzido para 100 páginas (~400KB) para checkpoints mais frequentes
                db.run("PRAGMA wal_autocheckpoint=100;", (err) => {
                    if (err) {
                        const msg = String(err?.message || '').toLowerCase();
                        if (msg.includes('busy') || msg.includes('locked')) {
                            this.initBusy = true;
                            console.warn('⚠️ Banco ocupado ao configurar wal_autocheckpoint; seguindo sem alterar.');
                            resolve(); // não bloquear inicialização
                        } else {
                            console.error('❌ Erro ao configurar wal_autocheckpoint:', err);
                            resolve(); // suavizar erro de PRAGMA para não travar init
                        }
                    } else {
                        console.log('✅ WAL autocheckpoint configurado para 100 páginas');
                        // Em alguns sistemas, habilitar fullfsync no checkpoint pode melhorar a visibilidade imediata
                        db.run("PRAGMA checkpoint_fullfsync=ON;", (fsErr) => {
                            if (fsErr) {
                                const msg = String(fsErr?.message || '').toLowerCase();
                                if (msg.includes('busy') || msg.includes('locked')) {
                                    this.initBusy = true;
                                    console.warn('⚠️ Banco ocupado ao configurar checkpoint_fullfsync; mantendo padrão.');
                                } else {
                                    console.warn('⚠️ Aviso ao configurar checkpoint_fullfsync (não crítico):', fsErr);
                                }
                                resolve();
                            } else {
                                console.log('✅ checkpoint_fullfsync habilitado');
                                resolve();
                            }
                        });
                    }
                });
            });
        });
    }

    /**
     * Cria todas as tabelas necessárias
     */
    private async createIndexes(): Promise<void> {
        if (!this.db) {
            throw new Error('Banco de dados não inicializado');
        }

        console.log('📊 Criando índices para melhorar performance...');

        const indexes = [
            // Índices para tabela inventory
            'CREATE INDEX IF NOT EXISTS idx_inventory_reagent ON inventory(reagent)',
            'CREATE INDEX IF NOT EXISTS idx_inventory_validity ON inventory(validity)',
            'CREATE INDEX IF NOT EXISTS idx_inventory_quantity ON inventory(quantity)',
            'CREATE INDEX IF NOT EXISTS idx_inventory_manufacturer ON inventory(manufacturer)',
            
            // Índices para tabela scheduled_assays
            'CREATE INDEX IF NOT EXISTS idx_scheduled_assays_status ON scheduled_assays(status)',
            'CREATE INDEX IF NOT EXISTS idx_scheduled_assays_start_date ON scheduled_assays(start_date)',
            'CREATE INDEX IF NOT EXISTS idx_scheduled_assays_end_date ON scheduled_assays(end_date)',
            'CREATE INDEX IF NOT EXISTS idx_scheduled_assays_protocol ON scheduled_assays(protocol)',
            
            // Índices para tabela safety_scheduled_assays
            'CREATE INDEX IF NOT EXISTS idx_safety_scheduled_assays_status ON safety_scheduled_assays(status)',
            'CREATE INDEX IF NOT EXISTS idx_safety_scheduled_assays_start_date ON safety_scheduled_assays(start_date)',
            'CREATE INDEX IF NOT EXISTS idx_safety_scheduled_assays_end_date ON safety_scheduled_assays(end_date)',
            
            // Índices para tabela historical_assays
            'CREATE INDEX IF NOT EXISTS idx_historical_assays_status ON historical_assays(status)',
            'CREATE INDEX IF NOT EXISTS idx_historical_assays_start_date ON historical_assays(start_date)',
            'CREATE INDEX IF NOT EXISTS idx_historical_assays_protocol ON historical_assays(protocol)',
            
            // Índices para tabela calibration_equipments
            'CREATE INDEX IF NOT EXISTS idx_calibration_equipments_status ON calibration_equipments(status)',
            'CREATE INDEX IF NOT EXISTS idx_calibration_equipments_next_date ON calibration_equipments(next_calibration_date)',
            'CREATE INDEX IF NOT EXISTS idx_calibration_equipments_equipment ON calibration_equipments(equipment_name)',
            
            // Índices para tabela holidays
            'CREATE INDEX IF NOT EXISTS idx_holidays_start_date ON holidays(start_date)',
            'CREATE INDEX IF NOT EXISTS idx_holidays_end_date ON holidays(end_date)',
        ];

        for (const indexSql of indexes) {
            try {
                await this.runQuery(indexSql);
            } catch (error) {
                console.warn(`⚠️ Erro ao criar índice: ${indexSql}`, error);
            }
        }

        console.log('✅ Índices criados com sucesso');
    }

    /**
     * Controla operações concorrentes para evitar sobrecarga do banco
     */
    private async queueOperation<T>(operation: () => Promise<T>): Promise<T> {
        // Se há muitas operações ativas, aguarda na fila
        if (this.activeOperations >= this.maxConcurrentOperations) {
            await this.operationQueue;
        }

        this.activeOperations++;
        
        const currentOperation = this.operationQueue.then(async () => {
            try {
                return await operation();
            } finally {
                this.activeOperations--;
                // Se ficou ocioso, agenda VACUUM (se habilitado)
                if (this.activeOperations === 0 && this.enableAutoVacuum) {
                    if (this.vacuumTimer) {
                        clearTimeout(this.vacuumTimer);
                    }
                    this.vacuumTimer = setTimeout(async () => {
                        try {
                            // Executa VACUUM fora de transação e em momento ocioso
                            await this.runQuery('VACUUM');
                            console.log('✅ VACUUM executado durante período ocioso');
                        } catch (vacErr) {
                            console.warn('⚠️ Falha ao executar VACUUM:', vacErr);
                        }
                    }, this.vacuumDelayMs);
                }
            }
        });

        this.operationQueue = currentOperation.catch(() => {}); // Ignora erros na fila
        return currentOperation;
    }

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
                report_date TEXT NOT NULL,
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
                report_date TEXT NOT NULL,
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
        await this.migrateReportDateColumns();
        
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
      private async migrateReportDateColumns(): Promise<void> {
        try {
            // Verificar tabela scheduled_assays
            const scheduledInfo = await this.selectQuery("PRAGMA table_info(scheduled_assays)");
            const hasScheduledReportDate = scheduledInfo.some((col: any) => col.name === 'report_date');
            
            if (!hasScheduledReportDate) {
                // Adiciona a coluna com um valor padrão para não quebrar registros existentes
                await this.runQuery("ALTER TABLE scheduled_assays ADD COLUMN report_date TEXT NOT NULL DEFAULT ''");
                console.log('✅ Coluna report_date adicionada à tabela scheduled_assays');
            }

            // Verificar tabela safety_scheduled_assays
            const safetyInfo = await this.selectQuery("PRAGMA table_info(safety_scheduled_assays)");
            const hasSafetyReportDate = safetyInfo.some((col: any) => col.name === 'report_date');

            if (!hasSafetyReportDate) {
                // Adiciona a coluna com um valor padrão
                await this.runQuery("ALTER TABLE safety_scheduled_assays ADD COLUMN report_date TEXT NOT NULL DEFAULT ''");
                console.log('✅ Coluna report_date adicionada à tabela safety_scheduled_assays');
            }
        } catch (error) {
            console.error('❌ Erro na migração da coluna report_date:', error);
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
                    // Após uma escrita fora de transação, verificar se devemos executar checkpoint
                    try {
                        const trimmed = (sql || '').trim().toUpperCase();
                        const isWrite = /^(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|VACUUM)/.test(trimmed) || (trimmed.startsWith('PRAGMA') && !trimmed.includes('QUERY_ONLY'));
                        if (isWrite) {
                            // Incrementa contador de escritas
                            self.writesSinceCheckpoint++;
                            // Agenda verificação de checkpoint sem bloquear a resposta
                            setImmediate(() => {
                                self.maybeCheckpoint('write').catch((e) => {
                                    console.warn('⚠️ Falha no checkpoint pós-escrita:', e);
                                });
                            });
                        }
                    } catch {}
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

        const execSelect = (dbConn: sqlite3.Database, resolve: (rows: any[]) => void, reject: (err: any) => void) => {
            dbConn.all(sql, params, (err, rows) => {
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
        };

        return new Promise((resolve, reject) => {
            // Preferir conexão somente leitura se disponível
            if (this.roDb) {
                execSelect(this.roDb, resolve, (err) => {
                    // Se falhar por estar ocupada ou não disponível, tenta conexão principal
                    const msg = (err && err.message) || '';
                    if (msg.includes('SQLITE_BUSY') || msg.includes('database is locked')) {
                        execSelect(this.db!, resolve, reject);
                    } else {
                        // Erros genéricos também tentam conexão principal como fallback
                        execSelect(this.db!, resolve, reject);
                    }
                });
            } else {
                execSelect(this.db!, resolve, reject);
            }
        });
    }

    /**
     * Decide se deve executar um checkpoint WAL com base em:
     * - transação ativa (suprime);
     * - número de escritas desde o último checkpoint;
     * - intervalo mínimo desde o último checkpoint;
     * - tamanho atual do arquivo WAL.
     */
    private async maybeCheckpoint(reason: string = 'write'): Promise<void> {
        try {
            if (!this.db) return;
            if (this.networkMode) return; // no WAL em modo rede
            if (this.transactionDepth > 0) return; // evitar durante transação

            const now = Date.now();
            const sinceLast = now - (this.lastCheckpointTime || 0);

            let walSize = 0;
            try {
                const walPath = `${this.dbPath}-wal`;
                if (fs.existsSync(walPath)) {
                    walSize = fs.statSync(walPath).size;
                }
            } catch {}

            const byWrites = this.writesSinceCheckpoint >= this.checkpointWriteThreshold;
            const byTime = sinceLast >= this.checkpointMinIntervalMs;
            const bySize = walSize >= this.walSizeThresholdBytes;

            if (byWrites || byTime || bySize) {
                await new Promise<void>((resolve) => {
                    if (this.networkMode) return resolve();
                    this.db!.run('PRAGMA wal_checkpoint(TRUNCATE);', () => resolve());
                });
                this.lastCheckpointTime = Date.now();
                this.writesSinceCheckpoint = 0;
                if (bySize) {
                    console.log(`✅ Checkpoint WAL por tamanho (${walSize} bytes)`);
                } else if (byWrites) {
                    console.log(`✅ Checkpoint WAL por quantidade de escritas (${reason})`);
                } else {
                    console.log(`✅ Checkpoint WAL por intervalo (${this.checkpointMinIntervalMs}ms)`);
                }
            }
        } catch (e) {
            console.warn('⚠️ maybeCheckpoint falhou:', e);
        }
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
                reportDate: assay.report_date,
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
                reportDate: assay.report_date,
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
     * Salva dados no banco SQLite com controle de operações concorrentes
     */
    async saveData(data: any): Promise<void> {
        return this.queueOperation(async () => {
            if (!this.db) {
                throw new Error('Banco de dados não inicializado');
            }

            console.log(`💾 Iniciando salvamento de dados (modo: ${this.fullSyncMode ? 'FULL' : 'DELTA'})...`);
            const startTime = Date.now();

            try {
                // Escolher entre FULL (com deleções) ou DELTA (UPSERT sem deleções globais)
                if (this.fullSyncMode) {
                    await this.saveDataInBatches(data);
                } else {
                    await this.saveDataInBatchesDelta(data);
                }
                
                this.saveCount++;
                const duration = Date.now() - startTime;
                console.log(`✅ Dados salvos com sucesso em ${duration}ms (salvamento #${this.saveCount})`);

                /* Executar VACUUM periodicamente (a cada 10 salvamentos) fora da transação principal
                if (this.saveCount % 10 === 0) {
                    console.log('🧹 Executando limpeza do banco de dados...');
                    try {
                        await this.runQuery('VACUUM');
                        console.log('✅ Limpeza do banco concluída');
                    } catch (vacuumError) {
                        console.warn('⚠️ Erro na limpeza do banco:', vacuumError);
                    }
                }*/
            } catch (error) {
                console.error('❌ Erro ao salvar dados:', error);
                throw error;
            }
        });
    }

    /**
     * Define o modo de sincronização padrão para operações de salvamento.
     * Quando true, utiliza sincronização completa com deleções globais; quando false, utiliza DELTA.
     */
    setFullSyncMode(enabled: boolean): void {
        this.fullSyncMode = enabled;
        console.log(`[SYNC MODE] Modo de sincronização padrão definido para: ${enabled ? 'FULL' : 'DELTA'}`);
    }

    /**
     * Define o modo rede (journal DELETE, sem WAL), melhor para compartilhamento em SMB/NFS.
     * Deve ser chamado ANTES de initialize() para surtir efeito na configuração inicial.
     */
    setNetworkMode(enabled: boolean): void {
        this.networkMode = enabled;
        console.log(`[NETWORK MODE] ${enabled ? 'Ativado (journal=DELETE, synchronous=FULL)' : 'Desativado (journal=WAL, com checkpoints)'}`);
    }

    /**
     * Salva dados no modo DELTA: apenas as coleções presentes em `data` são upsertadas
     * usando operações mais curtas e sem deleções globais de tabelas.
     */
    async saveDataDelta(data: any): Promise<void> {
        return this.queueOperation(async () => {
            if (!this.db) {
                throw new Error('Banco de dados não inicializado');
            }

            console.log('💾 Iniciando salvamento de dados (DELTA)...');
            const startTime = Date.now();

            try {
                await this.saveDataInBatchesDelta(data);

                this.saveCount++;
                const duration = Date.now() - startTime;
                console.log(`✅ Dados (DELTA) salvos em ${duration}ms (salvamento #${this.saveCount})`);
            } catch (error) {
                console.error('❌ Erro ao salvar dados (DELTA):', error);
                throw error;
            }
        });
    }

    private async saveDataInBatches(data: any): Promise<void> {
        // Batch 1: Dados críticos (inventário e configurações)
        await this.transaction(async (tx) => {
            if (data.inventory) {
                await this.saveInventoryOptimized(tx, data.inventory);
            }
            if (data.settings) {
                await this.saveSettings(tx, data.settings);
            }
        });

        // Batch 2: Ensaios históricos (podem ser grandes)
        if (data.historicalAssays && data.historicalAssays.length > 0) {
            await this.transaction(async (tx) => {
                await this.saveHistoricalAssays(tx, data.historicalAssays);
            });
        }

        // Batch 3: Ensaios agendados
        await this.transaction(async (tx) => {
            if (data.scheduledAssays) {
                await this.saveScheduledAssays(tx, data.scheduledAssays);
            }
            if (data.safetyScheduledAssays) {
                await this.saveSafetyScheduledAssays(tx, data.safetyScheduledAssays);
            }
        });

        // Batch 4: Calibrações e outros dados
        await this.transaction(async (tx) => {
            if (data.calibrations) {
                await this.saveCalibrations(tx, data.calibrations);
            }
            if (data.calibrationEquipments) {
                await this.saveCalibrationEquipments(tx, data.calibrationEquipments);
            }
            if (data.holidays) {
                await this.saveHolidays(tx, data.holidays);
            }
        });

        // Batch 5: Dados de sistema (categorias e usuários)
        await this.transaction(async (tx) => {
            if (data.efficiencyCategories) {
                await this.saveCategories(tx, 'efficiency_categories', data.efficiencyCategories);
            }
            if (data.safetyCategories) {
                await this.saveCategories(tx, 'safety_categories', data.safetyCategories);
            }
            if (data.systemUsers) {
                await this.saveSystemUsers(tx, data.systemUsers);
            }
        });
    }

    /**
     * Versão DELTA do salvamento em lotes: não executa deleções globais e usa UPSERT.
     */
    private async saveDataInBatchesDelta(data: any): Promise<void> {
        // Batch 1: Dados críticos (inventário e configurações)
        await this.transaction(async (tx) => {
            if (data.inventory) {
                await this.saveInventoryOptimized(tx, data.inventory);
            }
            if (data.settings) {
                await this.upsertSettings(tx, data.settings);
            }
        });

        // Batch 2: Ensaios históricos (podem ser grandes)
        if (data.historicalAssays && data.historicalAssays.length > 0) {
            await this.transaction(async (tx) => {
                await this.saveHistoricalAssaysDelta(tx, data.historicalAssays);
            });
        }

        // Batch 3: Ensaios agendados
        await this.transaction(async (tx) => {
            if (data.scheduledAssays) {
                await this.upsertScheduledAssays(tx, data.scheduledAssays);

                // Exclusões: remover registros que não estão no conjunto enviado
                const ids = (data.scheduledAssays || [])
                    .map((a: any) => a.id)
                    .filter((id: any) => id !== null && id !== undefined);
                if (ids.length > 0) {
                    const placeholders = ids.map(() => '?').join(',');
                    await tx.runQuery(`DELETE FROM scheduled_assays WHERE id NOT IN (${placeholders})`, ids);
                } else {
                    // Se a lista estiver vazia, remove todos os registros
                    await tx.runQuery('DELETE FROM scheduled_assays');
                }
            }
            if (data.safetyScheduledAssays) {
                await this.upsertSafetyScheduledAssays(tx, data.safetyScheduledAssays);

                // Exclusões: remover registros que não estão no conjunto enviado
                const ids = (data.safetyScheduledAssays || [])
                    .map((a: any) => a.id)
                    .filter((id: any) => id !== null && id !== undefined);
                if (ids.length > 0) {
                    const placeholders = ids.map(() => '?').join(',');
                    await tx.runQuery(`DELETE FROM safety_scheduled_assays WHERE id NOT IN (${placeholders})`, ids);
                } else {
                    // Se a lista estiver vazia, remove todos os registros
                    await tx.runQuery('DELETE FROM safety_scheduled_assays');
                }
            }
        });

        // Batch 4: Calibrações e outros dados
        await this.transaction(async (tx) => {
            if (data.calibrations) {
                await this.upsertCalibrations(tx, data.calibrations);
            }
            if (data.calibrationEquipments) {
                await this.upsertCalibrationEquipments(tx, data.calibrationEquipments);
            }
            if (data.holidays) {
                await this.upsertHolidays(tx, data.holidays);
            }
        });

        // Batch 5: Dados de sistema (categorias e usuários)
        await this.transaction(async (tx) => {
            if (data.efficiencyCategories) {
                await this.upsertCategories(tx, 'efficiency_categories', data.efficiencyCategories);
            }
            if (data.safetyCategories) {
                await this.upsertCategories(tx, 'safety_categories', data.safetyCategories);
            }
            if (data.systemUsers) {
                await this.upsertSystemUsers(tx, data.systemUsers);
            }
        });
    }


    // O VACUUM pode ser uma operação lenta e deve ser executado fora da transação principal
    /* para não bloquear outras operações.
    this.saveCount = (this.saveCount || 0) + 1;
    if (this.saveCount % 10 === 0) {
        console.log('Executando VACUUM para otimizar o banco de dados...');
        await this.runQuery('VACUUM');
        console.log('VACUUM concluído.');
    }*/
    /**
     * Executa uma série de operações dentro de uma transação SQLite.
     * Garante que `COMMIT` seja chamado em caso de sucesso e `ROLLBACK` em caso de erro.
     */
    private async transaction(callback: (tx: { runQuery: (sql: string, params?: any[]) => Promise<any> }) => Promise<void>): Promise<void> {
    if (!this.db) {
        throw new Error('Banco de dados não inicializado');
    }

    // Inicia a transação
    await new Promise<void>((resolve, reject) => {
        this.db!.run('BEGIN TRANSACTION', (err) => err ? reject(err) : resolve());
    });
    // Marca transação ativa para suprimir checkpoints automáticos
    this.transactionDepth++;

    try {
        // Objeto de transação com um runQuery que opera dentro do contexto da transação
        const tx = {
            runQuery: (sql: string, params: any[] = []): Promise<any> => {
                return new Promise((resolve, reject) => {
                    this.db!.run(sql, params, function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ lastID: this.lastID, changes: this.changes });
                        }
                    });
                });
            }
        };

        // Executa o callback com as operações do banco
        await callback(tx);

        // Se tudo correu bem, confirma a transação
    await new Promise<void>((resolve, reject) => {
        this.db!.run('COMMIT', (err) => err ? reject(err) : resolve());
    });

    // Realiza checkpoint para aplicar páginas do WAL ao banco principal
    // Usamos TRUNCATE para reduzir tamanho do arquivo -wal rapidamente
    if (!this.networkMode) {
        await new Promise<void>((resolve) => {
            this.db!.run('PRAGMA wal_checkpoint(TRUNCATE);', () => resolve());
        });
    }
    // Atualiza estado dos checkpoints
    this.lastCheckpointTime = Date.now();
    this.writesSinceCheckpoint = 0;
    this.transactionDepth = Math.max(0, this.transactionDepth - 1);
    } catch (error) {
        console.error('Erro na transação, revertendo alterações (ROLLBACK)...');
        // Se ocorrer um erro, reverte a transação
        await new Promise<void>((resolve) => {
            this.db!.run('ROLLBACK', () => resolve());
        });
        // Libera estado de transação
        this.transactionDepth = Math.max(0, this.transactionDepth - 1);
        // Re-lança o erro original para que a chamada superior saiba que algo deu errado
        throw error;
    }
    }
    

    private async bulkInsert(tx: any, table: string, columns: string[], data: any[], preprocessFn: (item: any) => any[], options?: { delete?: boolean }) {
    const shouldDelete = options?.delete ?? true; // O padrão é deletar

    // Se a exclusão for necessária, limpa a tabela.
    if (shouldDelete) {
        await tx.runQuery(`DELETE FROM ${table}`);
    }

    // Se não houver dados para inserir, retorna após a possível limpeza.
    if (!data || data.length === 0) {
        return;
    }

    // Prepara os dados e os placeholders para a inserção em massa
    const values: any[] = [];
    const placeholders: string[] = [];

    for (const item of data) {
        const processedValues = preprocessFn(item);
        values.push(...processedValues);
        placeholders.push(`(${new Array(columns.length).fill('?').join(',')})`);
    }

    // Monta e executa a query de inserção em massa
    const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`;
    await tx.runQuery(sql, values);
    }

    private async saveInventory(tx: any, items: any[]) {
    const columns = ['id', 'reagent', 'manufacturer', 'lot', 'quantity', 'validity'];
    await this.bulkInsert(tx, 'inventory', columns, items, item => [
        item.id,
        item.reagent || 'Não especificado',
        item.manufacturer || 'Não especificado',
        item.lot || 'Não especificado',
        item.quantity || 0,
        item.validity || new Date().toISOString(),
    ]);
    }

    private async saveInventoryOptimized(tx: any, items: any[]) {
    if (!items || items.length === 0) {
        return;
    }

    // Usar UPSERT (INSERT OR REPLACE) em vez de DELETE + INSERT
    // Isso é mais eficiente pois não bloqueia a tabela inteira
    const sql = `
        INSERT OR REPLACE INTO inventory 
        (id, reagent, manufacturer, lot, quantity, validity) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    // Processar em lotes menores para reduzir bloqueio
    const batchSize = 100;
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        
        for (const item of batch) {
            await tx.runQuery(sql, [
                item.id,
                item.reagent || 'Não especificado',
                item.manufacturer || 'Não especificado',
                item.lot || 'Não especificado',
                item.quantity || 0,
                item.validity || new Date().toISOString(),
            ]);
        }
    }
    }

    private async saveHistoricalAssays(tx: any, assays: any[]) {
        // Limpa as tabelas manualmente para garantir a ordem correta por causa da chave estrangeira.
        await tx.runQuery('DELETE FROM assay_lots');
        await tx.runQuery('DELETE FROM historical_assays');

        if (!assays || assays.length === 0) {
            return;
        }

        // Inserção em massa para historical_assays, sem deletar novamente
        const assayColumns = ['id', 'protocol', 'orcamento', 'assay_manufacturer', 'model', 'nominal_load', 'tensao', 'start_date', 'end_date', 'setup', 'status', 'type', 'observacoes', 'cycles', 'report', 'consumption', 'total_consumption'];
        await this.bulkInsert(tx, 'historical_assays', assayColumns, assays, assay => [
            assay.id,
            assay.protocol || 'Não especificado',
            assay.orcamento || 'Não especificado',
            assay.assayManufacturer || 'Não especificado',
            assay.model || 'Não especificado',
            assay.nominalLoad || 0,
            assay.tensao || 0,
            assay.startDate || new Date().toISOString(),
            assay.endDate || new Date().toISOString(),
            assay.setup || 1,
            assay.status || 'completed',
            assay.type || 'efficiency',
            assay.observacoes,
            assay.cycles,
            assay.report,
            JSON.stringify(assay.consumption) || null,
            assay.totalConsumption || null,
        ], { delete: false }); // Desativa a deleção automática

        // Lida com a tabela aninhada `assay_lots`
        const lotColumns = ['assay_id', 'reagent_type', 'lot', 'cycles'];
        const allLots = assays.flatMap(assay => {
            if (!assay.lots) return [];
            return Object.entries(assay.lots).flatMap(([reagentType, lots]) =>
                (lots as any[])
                    .filter(lot => lot.lot && lot.lot !== 'N/A')
                    .map(lot => ({
                        assay_id: assay.id,
                        reagent_type: reagentType,
                        lot: lot.lot,
                        cycles: lot.cycles || 0
                    }))
            );
        });

        if (allLots.length > 0) {
            await this.bulkInsert(tx, 'assay_lots', lotColumns, allLots, lot => [
                lot.assay_id,
                lot.reagent_type,
                lot.lot,
                lot.cycles,
            ], { delete: false }); // Desativa a deleção automática
        }
    }

    /**
     * Versão DELTA: UPSERT de ensaios históricos e substituição de lots por assay
     */
    private async saveHistoricalAssaysDelta(tx: any, assays: any[]) {
        if (!assays || assays.length === 0) {
            return;
        }

        const assaySql = `
            INSERT OR REPLACE INTO historical_assays 
            (id, protocol, orcamento, assay_manufacturer, model, nominal_load, tensao, start_date, end_date, setup, status, type, observacoes, cycles, report, consumption, total_consumption)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const batchSize = 100;
        for (let i = 0; i < assays.length; i += batchSize) {
            const batch = assays.slice(i, i + batchSize);
            for (const assay of batch) {
                await tx.runQuery(assaySql, [
                    assay.id,
                    assay.protocol || 'Não especificado',
                    assay.orcamento || 'Não especificado',
                    assay.assayManufacturer || 'Não especificado',
                    assay.model || 'Não especificado',
                    assay.nominalLoad || 0,
                    assay.tensao || 0,
                    assay.startDate || new Date().toISOString(),
                    assay.endDate || new Date().toISOString(),
                    assay.setup || 1,
                    assay.status || 'completed',
                    assay.type || 'efficiency',
                    assay.observacoes,
                    assay.cycles,
                    assay.report,
                    JSON.stringify(assay.consumption) || null,
                    assay.totalConsumption || null,
                ]);

                // Log para backup incremental
                this.incrementalBackup.logChange('historical_assays', 'UPDATE', assay.id, undefined, assay);

                // Atualizar lots deste assay: limpa existentes e insere os novos
                await tx.runQuery('DELETE FROM assay_lots WHERE assay_id = ?', [assay.id]);
                if (assay.lots) {
                    const lotSql = `INSERT OR REPLACE INTO assay_lots (assay_id, reagent_type, lot, cycles) VALUES (?, ?, ?, ?)`;
                    for (const [reagentType, lots] of Object.entries(assay.lots)) {
                        for (const lot of (lots as any[])) {
                            if (lot.lot && lot.lot !== 'N/A') {
                                await tx.runQuery(lotSql, [assay.id, reagentType, lot.lot, lot.cycles || 0]);
                                this.incrementalBackup.logChange('assay_lots', 'UPDATE', `${assay.id}-${reagentType}-${lot.lot}`, undefined, lot);
                            }
                        }
                    }
                }
            }
        }
    }

    

    private async saveScheduledAssays(tx: any, assays: any[]) {
        const columns = ['id', 'protocol', 'orcamento', 'report_date', 'assay_manufacturer', 'model', 'nominal_load', 'tensao', 'start_date', 'end_date', 'setup', 'status', 'type', 'observacoes', 'cycles', 'planned_suppliers'];
        await this.bulkInsert(tx, 'scheduled_assays', columns, assays, assay => [
            assay.id,
            assay.protocol || 'Não especificado',
            assay.orcamento || 'Não especificado',
            assay.reportDate || '',
            assay.assayManufacturer || 'Não especificado',
            assay.model || 'Não especificado',
            assay.nominalLoad || 0,
            assay.tensao || 0,
            assay.startDate || new Date().toISOString(),
            assay.endDate || new Date().toISOString(),
            assay.setup || 1,
            assay.status || 'scheduled',
            assay.type || 'efficiency',
            assay.observacoes,
            assay.cycles,
            JSON.stringify(assay.plannedSuppliers || null),
        ]);
    }

    /**
     * Versão DELTA: UPSERT de ensaios agendados
     */
    private async upsertScheduledAssays(tx: any, assays: any[]) {
        if (!assays || assays.length === 0) {
            return;
        }
        const sql = `
            INSERT OR REPLACE INTO scheduled_assays 
            (id, protocol, orcamento, report_date, assay_manufacturer, model, nominal_load, tensao, start_date, end_date, setup, status, type, observacoes, cycles, planned_suppliers)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const batchSize = 100;
        for (let i = 0; i < assays.length; i += batchSize) {
            const batch = assays.slice(i, i + batchSize);
            for (const assay of batch) {
                await tx.runQuery(sql, [
                    assay.id,
                    assay.protocol || 'Não especificado',
                    assay.orcamento || 'Não especificado',
                    assay.reportDate || '',
                    assay.assayManufacturer || 'Não especificado',
                    assay.model || 'Não especificado',
                    assay.nominalLoad || 0,
                    assay.tensao || 0,
                    assay.startDate || new Date().toISOString(),
                    assay.endDate || new Date().toISOString(),
                    assay.setup || 1,
                    assay.status || 'scheduled',
                    assay.type || 'efficiency',
                    assay.observacoes,
                    assay.cycles,
                    JSON.stringify(assay.plannedSuppliers || null),
                ]);

                // Log para backup incremental
                this.incrementalBackup.logChange('scheduled_assays', 'UPDATE', assay.id, undefined, assay);
            }
        }
    }

    private async saveSafetyScheduledAssays(tx: any, assays: any[]) {
        const columns = ['id', 'protocol', 'orcamento', 'report_date', 'assay_manufacturer', 'model', 'nominal_load', 'tensao', 'start_date', 'end_date', 'setup', 'status', 'type', 'observacoes', 'cycles', 'sub_row_index', 'planned_suppliers'];
        await this.bulkInsert(tx, 'safety_scheduled_assays', columns, assays, assay => [
            assay.id,
            assay.protocol || 'Não especificado',
            assay.orcamento || 'Não especificado',
            assay.reportDate || '',
            assay.assayManufacturer || 'Não especificado',
            assay.model || 'Não especificado',
            assay.nominalLoad || 0,
            assay.tensao || 0,
            assay.startDate || new Date().toISOString(),
            assay.endDate || new Date().toISOString(),
            assay.setup || 1,
            assay.status || 'scheduled',
            assay.type || 'safety',
            assay.observacoes,
            assay.cycles,
            assay.subRowIndex || assay.sub_row_index || 0,
            JSON.stringify(assay.plannedSuppliers || null),
        ]);
    }

    /**
     * Versão DELTA: UPSERT de ensaios agendados de segurança
     */
    private async upsertSafetyScheduledAssays(tx: any, assays: any[]) {
        if (!assays || assays.length === 0) {
            return;
        }
        const sql = `
            INSERT OR REPLACE INTO safety_scheduled_assays 
            (id, protocol, orcamento, report_date, assay_manufacturer, model, nominal_load, tensao, start_date, end_date, setup, status, type, observacoes, cycles, sub_row_index, planned_suppliers)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const batchSize = 100;
        for (let i = 0; i < assays.length; i += batchSize) {
            const batch = assays.slice(i, i + batchSize);
            for (const assay of batch) {
                await tx.runQuery(sql, [
                    assay.id,
                    assay.protocol || 'Não especificado',
                    assay.orcamento || 'Não especificado',
                    assay.reportDate || '',
                    assay.assayManufacturer || 'Não especificado',
                    assay.model || 'Não especificado',
                    assay.nominalLoad || 0,
                    assay.tensao || 0,
                    assay.startDate || new Date().toISOString(),
                    assay.endDate || new Date().toISOString(),
                    assay.setup || 1,
                    assay.status || 'scheduled',
                    assay.type || 'safety',
                    assay.observacoes,
                    assay.cycles,
                    assay.subRowIndex || assay.sub_row_index || 0,
                    JSON.stringify(assay.plannedSuppliers || null),
                ]);

                // Log para backup incremental
                this.incrementalBackup.logChange('safety_scheduled_assays', 'UPDATE', assay.id, undefined, assay);
            }
        }
    }

    private async saveCalibrations(tx: any, calibrations: any[]) {
        const columns = ['id', 'protocol', 'start_date', 'end_date', 'type', 'status', 'affected_terminals'];
        await this.bulkInsert(tx, 'calibrations', columns, calibrations, cal => [
            cal.id,
            cal.equipment || cal.protocol || 'Não especificado',
            cal.startDate || new Date().toISOString(),
            cal.endDate || new Date().toISOString(),
            cal.type || 'calibration',
            cal.status || 'scheduled',
            cal.observacoes || cal.affected_terminals || '',
        ]);
    }

    private async upsertCalibrations(tx: any, calibrations: any[]) {
        if (!calibrations || calibrations.length === 0) {
            return;
        }
        const sql = `
            INSERT OR REPLACE INTO calibrations 
            (id, protocol, start_date, end_date, type, status, affected_terminals)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        for (const cal of calibrations) {
            await tx.runQuery(sql, [
                cal.id,
                cal.equipment || cal.protocol || 'Não especificado',
                cal.startDate || new Date().toISOString(),
                cal.endDate || new Date().toISOString(),
                cal.type || 'calibration',
                cal.status || 'scheduled',
                cal.observacoes || cal.affected_terminals || '',
            ]);

            // Log para backup incremental
            this.incrementalBackup.logChange('calibrations', 'UPDATE', cal.id, undefined, cal);
        }
    }

    private async saveCalibrationEquipments(tx: any, equipments: any[]) {
        const columns = ['id', 'tag', 'equipment', 'validity', 'observations', 'calibration_status', 'calibration_start_date'];
        await this.bulkInsert(tx, 'calibration_equipments', columns, equipments, eq => [
            eq.id,
            eq.tag || eq.name || `TAG-${eq.id}`,
            eq.equipment || eq.name || 'Equipamento',
            eq.validity || '',
            eq.observations || '',
            eq.calibrationStatus || 'disponivel',
            eq.calibrationStartDate || null,
        ]);
    }

    private async upsertCalibrationEquipments(tx: any, equipments: any[]) {
        if (!equipments || equipments.length === 0) {
            return;
        }
        const sql = `
            INSERT OR REPLACE INTO calibration_equipments 
            (id, tag, equipment, validity, observations, calibration_status, calibration_start_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        for (const eq of equipments) {
            await tx.runQuery(sql, [
                eq.id,
                eq.tag || eq.name || `TAG-${eq.id}`,
                eq.equipment || eq.name || 'Equipamento',
                eq.validity || '',
                eq.observations || '',
                eq.calibrationStatus || 'disponivel',
                eq.calibrationStartDate || null,
            ]);

            // Log para backup incremental
            this.incrementalBackup.logChange('calibration_equipments', 'UPDATE', eq.id, undefined, eq);
        }
    }

    private async saveHolidays(tx: any, holidays: any[]) {
        const columns = ['id', 'name', 'start_date', 'end_date'];
        await this.bulkInsert(tx, 'holidays', columns, holidays, holiday => [
            holiday.id,
            holiday.name || 'Feriado',
            holiday.startDate || holiday.date || new Date().toISOString(),
            holiday.endDate || holiday.date || new Date().toISOString(),
        ]);
    }

    private async upsertHolidays(tx: any, holidays: any[]) {
        if (!holidays || holidays.length === 0) {
            return;
        }
        const sql = `
            INSERT OR REPLACE INTO holidays (id, name, start_date, end_date) VALUES (?, ?, ?, ?)
        `;
        for (const holiday of holidays) {
            await tx.runQuery(sql, [
                holiday.id,
                holiday.name || 'Feriado',
                holiday.startDate || holiday.date || new Date().toISOString(),
                holiday.endDate || holiday.date || new Date().toISOString(),
            ]);

            // Log para backup incremental
            this.incrementalBackup.logChange('holidays', 'UPDATE', holiday.id, undefined, holiday);
        }
    }

    private async saveSettings(tx: any, settings: Record<string, any>) {
        const settingsData = Object.entries(settings);
        const columns = ['key', 'value'];
        await this.bulkInsert(tx, 'settings', columns, settingsData, ([key, value]) => [
            key,
            JSON.stringify(value),
        ]);
    }

    private async upsertSettings(tx: any, settings: Record<string, any>) {
        const settingsData = Object.entries(settings);
        const sql = 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)';
        for (const [key, value] of settingsData) {
            await tx.runQuery(sql, [key, JSON.stringify(value)]);
            this.incrementalBackup.logChange('settings', 'UPDATE', key, undefined, value);
        }
    }

    private async saveCategories(tx: any, table: string, categories: any[]) {
        const columns = ['id', 'name'];
        await this.bulkInsert(tx, table, columns, categories, category => [
            category.id,
            category.name || 'Categoria',
        ]);
        }

    private async upsertCategories(tx: any, table: string, categories: any[]) {
        if (!categories || categories.length === 0) {
            return;
        }
        const sql = `INSERT OR REPLACE INTO ${table} (id, name) VALUES (?, ?)`;
        for (const category of categories) {
            await tx.runQuery(sql, [category.id, category.name || 'Categoria']);
            this.incrementalBackup.logChange(table, 'UPDATE', category.id, undefined, category);
        }
    }

    private async saveSystemUsers(tx: any, users: Record<string, any>) {
    const usersData = Object.entries(users);
    const columns = ['username', 'type', 'display_name', 'permissions'];
    await this.bulkInsert(tx, 'system_users', columns, usersData, ([userId, userData]) => [
        userId,
        userData.type || 'user',
        userData.display_name || userData.displayName || userId,
        JSON.stringify(userData.permissions || []),
    ]);
    }

    private async upsertSystemUsers(tx: any, users: Record<string, any>) {
        const usersData = Object.entries(users);
        const sql = 'INSERT OR REPLACE INTO system_users (username, type, display_name, permissions) VALUES (?, ?, ?, ?)';
        for (const [userId, userData] of usersData) {
            await tx.runQuery(sql, [
                userId,
                userData.type || 'user',
                userData.display_name || userData.displayName || userId,
                JSON.stringify(userData.permissions || []),
            ]);
            this.incrementalBackup.logChange('system_users', 'UPDATE', userId, undefined, userData);
        }
    }

    /**
     * Fecha a conexão com o banco de dados
     */
    async close(): Promise<void> {
        // Função auxiliar para fechar a conexão somente leitura, se existir
        const closeReadOnly = (): void => {
            if (this.roDb) {
                this.roDb.close((roErr) => {
                    if (roErr) {
                        console.warn('⚠️ Erro ao fechar conexão somente leitura:', roErr);
                    } else {
                        console.log('✅ Conexão somente leitura fechada');
                    }
                    this.roDb = null;
                });
            }
        };

        // Função auxiliar para limpar timers agendados
        const cleanupTimers = (): void => {
            if (this.vacuumTimer) {
                clearTimeout(this.vacuumTimer);
                this.vacuumTimer = null;
            }
        };

        return new Promise(async (resolve, reject) => {
            try {
                if (this.db) {
                    // Executa checkpoint WAL para truncar o arquivo -wal antes de fechar (somente se não for modo rede)
                    if (!this.networkMode) {
                        try {
                            await this.runQuery('PRAGMA wal_checkpoint(TRUNCATE)');
                            console.log('✅ PRAGMA wal_checkpoint(TRUNCATE) executado com sucesso');
                        } catch (chkErr) {
                            console.warn('⚠️ Falha ao executar wal_checkpoint(TRUNCATE):', chkErr);
                        }
                    }

                    this.db.close((err) => {
                        if (err) {
                            console.error('Erro ao fechar banco de dados:', err);
                            reject(err);
                            return;
                        }
                        console.log('✅ Conexão com banco de dados fechada');
                        this.db = null;

                        // Fecha conexão somente leitura e limpa timers
                        closeReadOnly();
                        cleanupTimers();

                        // Em modo rede, remover arquivos -wal e -shm para evitar resíduos que causam IOERR
                        if (this.networkMode) {
                            try {
                                const walPath = `${this.dbPath}-wal`;
                                const shmPath = `${this.dbPath}-shm`;
                                if (fs.existsSync(walPath)) {
                                    fs.unlinkSync(walPath);
                                    console.log('🧹 Removido arquivo WAL residual:', walPath);
                                }
                                if (fs.existsSync(shmPath)) {
                                    fs.unlinkSync(shmPath);
                                    console.log('🧹 Removido arquivo SHM residual:', shmPath);
                                }
                            } catch (cleanupErr) {
                                console.warn('⚠️ Falha ao limpar arquivos -wal/-shm residuais:', cleanupErr);
                            }
                        }

                        resolve();
                    });
                } else {
                    // Mesmo sem conexão principal, garantir fechamento da somente leitura e limpar timers
                    closeReadOnly();
                    cleanupTimers();
                    resolve();
                }
            } catch (fatalErr) {
                reject(fatalErr);
            }
        });
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
        
        // Atualiza campos específicos e registra mudanças incrementalmente por chave
        const keys = Object.keys(sanitizedSettings);
        for (const key of keys) {
            const newValueRaw = sanitizedSettings[key];
            const newValue = typeof newValueRaw === 'object' ? JSON.stringify(newValueRaw) : newValueRaw;

            // Obter valor antigo para log (se existir)
            const existing = await this.selectQuery('SELECT value FROM settings WHERE key = ?', [key]);
            const oldValue = existing.length > 0 ? existing[0].value : undefined;

            // Atualiza ou insere a configuração
            await this.runQuery('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, newValue]);

            // Registrar mudança incremental por chave
            try {
                this.incrementalBackup.logChange('settings', 'UPDATE', key, oldValue, newValue);
            } catch (err) {
                // Falha no log não deve interromper atualização de configurações
            }
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

    // ==================== OPERAÇÕES GRANULARES PARA ENSAIOS AGENDADOS ====================

    /**
     * Cria um novo ensaio agendado
     */
    async createScheduledAssay(assay: Omit<Assay, 'id'>): Promise<number> {
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
        const safeReportDate = (assay as any).reportDate || '';
        const safePlannedSuppliers = JSON.stringify((assay as any).plannedSuppliers || null);

        const result = await this.runQuery(
            'INSERT INTO scheduled_assays (protocol, orcamento, report_date, assay_manufacturer, model, nominal_load, tensao, start_date, end_date, setup, status, type, observacoes, cycles, planned_suppliers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
            [safeProtocol, safeOrcamento, safeReportDate, safeAssayManufacturer, safeModel, safeNominalLoad, safeTensao, safeStartDate, safeEndDate, safeSetup, safeStatus, safeType, assay.observacoes, assay.cycles, safePlannedSuppliers]
        );

        return result.id;
    }

    /**
     * Cria um novo ensaio de segurança agendado
     */
    async createSafetyScheduledAssay(assay: Omit<Assay, 'id'>): Promise<number> {
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
        const safeReportDate = (assay as any).reportDate || '';
        const safePlannedSuppliers = JSON.stringify((assay as any).plannedSuppliers || null);
        const safeSubRowIndex = assay.subRowIndex || 0;

        const result = await this.runQuery(
            'INSERT INTO safety_scheduled_assays (protocol, orcamento, report_date, assay_manufacturer, model, nominal_load, tensao, start_date, end_date, setup, status, type, observacoes, cycles, sub_row_index, planned_suppliers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
            [safeProtocol, safeOrcamento, safeReportDate, safeAssayManufacturer, safeModel, safeNominalLoad, safeTensao, safeStartDate, safeEndDate, safeSetup, safeStatus, safeType, assay.observacoes, assay.cycles, safeSubRowIndex, safePlannedSuppliers]
        );

        return result.id;
    }

    /**
     * Busca um ensaio agendado por ID
     */
    async getScheduledAssayById(id: number): Promise<Assay | null> {
        const result = await this.selectQuery(
            'SELECT * FROM scheduled_assays WHERE id = ?',
            [id]
        );

        if (result.length === 0) {
            return null;
        }

        const assay = result[0];
        let plannedSuppliers = null;
        try {
            plannedSuppliers = JSON.parse(assay.planned_suppliers);
        } catch (error) {
            console.warn(`Erro ao fazer parse do plannedSuppliers para ensaio ${assay.id}:`, error);
            plannedSuppliers = null;
        }

        return {
            id: assay.id,
            protocol: assay.protocol,
            orcamento: assay.orcamento,
            assayManufacturer: assay.assay_manufacturer,
            model: assay.model,
            nominalLoad: assay.nominal_load,
            tensao: assay.tensao,
            startDate: assay.start_date,
            endDate: assay.end_date,
            setup: assay.setup,
            status: assay.status,
            type: assay.type,
            observacoes: assay.observacoes,
            cycles: assay.cycles,
            reportDate: assay.report_date,
            plannedSuppliers: plannedSuppliers,
            lots: { poBase: [], perborato: [], taed: [], tiras: [] }
        };
    }

    /**
     * Busca um ensaio de segurança agendado por ID
     */
    async getSafetyScheduledAssayById(id: number): Promise<Assay | null> {
        const result = await this.selectQuery(
            'SELECT * FROM safety_scheduled_assays WHERE id = ?',
            [id]
        );

        if (result.length === 0) {
            return null;
        }

        const assay = result[0];
        let plannedSuppliers = null;
        try {
            plannedSuppliers = JSON.parse(assay.planned_suppliers);
        } catch (error) {
            console.warn(`Erro ao fazer parse do plannedSuppliers para ensaio de segurança ${assay.id}:`, error);
            plannedSuppliers = null;
        }

        return {
            id: assay.id,
            protocol: assay.protocol,
            orcamento: assay.orcamento,
            assayManufacturer: assay.assay_manufacturer,
            model: assay.model,
            nominalLoad: assay.nominal_load,
            tensao: assay.tensao,
            startDate: assay.start_date,
            endDate: assay.end_date,
            setup: assay.setup,
            status: assay.status,
            type: assay.type,
            observacoes: assay.observacoes,
            cycles: assay.cycles,
            reportDate: assay.report_date,
            plannedSuppliers: plannedSuppliers,
            subRowIndex: assay.sub_row_index,
            lots: { poBase: [], perborato: [], taed: [], tiras: [] }
        };
    }

    /**
     * Busca todos os ensaios agendados
     */
    async getAllScheduledAssays(): Promise<Assay[]> {
        const result = await this.selectQuery('SELECT * FROM scheduled_assays ORDER BY start_date');
        
        return result.map(assay => {
            let plannedSuppliers = null;
            try {
                plannedSuppliers = JSON.parse(assay.planned_suppliers);
            } catch (error) {
                console.warn(`Erro ao fazer parse do plannedSuppliers para ensaio ${assay.id}:`, error);
                plannedSuppliers = null;
            }

            return {
                id: assay.id,
                protocol: assay.protocol,
                orcamento: assay.orcamento,
                assayManufacturer: assay.assay_manufacturer,
                model: assay.model,
                nominalLoad: assay.nominal_load,
                tensao: assay.tensao,
                startDate: assay.start_date,
                endDate: assay.end_date,
                setup: assay.setup,
                status: assay.status,
                type: assay.type,
                observacoes: assay.observacoes,
                cycles: assay.cycles,
                reportDate: assay.report_date,
                plannedSuppliers: plannedSuppliers,
                lots: { poBase: [], perborato: [], taed: [], tiras: [] }
            };
        });
    }

    /**
     * Busca todos os ensaios de segurança agendados
     */
    async getAllSafetyScheduledAssays(): Promise<Assay[]> {
        const result = await this.selectQuery('SELECT * FROM safety_scheduled_assays ORDER BY start_date');
        
        return result.map(assay => {
            let plannedSuppliers = null;
            try {
                plannedSuppliers = JSON.parse(assay.planned_suppliers);
            } catch (error) {
                console.warn(`Erro ao fazer parse do plannedSuppliers para ensaio de segurança ${assay.id}:`, error);
                plannedSuppliers = null;
            }

            return {
                id: assay.id,
                protocol: assay.protocol,
                orcamento: assay.orcamento,
                assayManufacturer: assay.assay_manufacturer,
                model: assay.model,
                nominalLoad: assay.nominal_load,
                tensao: assay.tensao,
                startDate: assay.start_date,
                endDate: assay.end_date,
                setup: assay.setup,
                status: assay.status,
                type: assay.type,
                observacoes: assay.observacoes,
                cycles: assay.cycles,
                reportDate: assay.report_date,
                plannedSuppliers: plannedSuppliers,
                subRowIndex: assay.sub_row_index,
                lots: { poBase: [], perborato: [], taed: [], tiras: [] }
            };
        });
    }

    /**
     * Atualiza um ensaio agendado específico
     */
    async updateScheduledAssay(id: number, updates: Partial<Assay>): Promise<void> {
        const fields = [];
        const values = [];

        if (updates.protocol !== undefined) {
            fields.push('protocol = ?');
            values.push(updates.protocol);
        }
        if (updates.orcamento !== undefined) {
            fields.push('orcamento = ?');
            values.push(updates.orcamento);
        }
        if ((updates as any).reportDate !== undefined) {
            fields.push('report_date = ?');
            values.push((updates as any).reportDate);
        }
        if (updates.assayManufacturer !== undefined) {
            fields.push('assay_manufacturer = ?');
            values.push(updates.assayManufacturer);
        }
        if (updates.model !== undefined) {
            fields.push('model = ?');
            values.push(updates.model);
        }
        if (updates.nominalLoad !== undefined) {
            fields.push('nominal_load = ?');
            values.push(updates.nominalLoad);
        }
        if (updates.tensao !== undefined) {
            fields.push('tensao = ?');
            values.push(updates.tensao);
        }
        if (updates.startDate !== undefined) {
            fields.push('start_date = ?');
            values.push(updates.startDate);
        }
        if (updates.endDate !== undefined) {
            fields.push('end_date = ?');
            values.push(updates.endDate);
        }
        if (updates.setup !== undefined) {
            fields.push('setup = ?');
            values.push(updates.setup);
        }
        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.type !== undefined) {
            fields.push('type = ?');
            values.push(updates.type);
        }
        if (updates.observacoes !== undefined) {
            fields.push('observacoes = ?');
            values.push(updates.observacoes);
        }
        if (updates.cycles !== undefined) {
            fields.push('cycles = ?');
            values.push(updates.cycles);
        }
        if ((updates as any).plannedSuppliers !== undefined) {
            fields.push('planned_suppliers = ?');
            values.push(JSON.stringify((updates as any).plannedSuppliers));
        }

        if (fields.length === 0) {
            return; // Nenhum campo para atualizar
        }

        values.push(id);
        const sql = `UPDATE scheduled_assays SET ${fields.join(', ')} WHERE id = ?`;
        
        await this.runQuery(sql, values);
    }

    /**
     * Atualiza um ensaio de segurança agendado específico
     */
    async updateSafetyScheduledAssay(id: number, updates: Partial<Assay>): Promise<void> {
        const fields = [];
        const values = [];

        if (updates.protocol !== undefined) {
            fields.push('protocol = ?');
            values.push(updates.protocol);
        }
        if (updates.orcamento !== undefined) {
            fields.push('orcamento = ?');
            values.push(updates.orcamento);
        }
        if ((updates as any).reportDate !== undefined) {
            fields.push('report_date = ?');
            values.push((updates as any).reportDate);
        }
        if (updates.assayManufacturer !== undefined) {
            fields.push('assay_manufacturer = ?');
            values.push(updates.assayManufacturer);
        }
        if (updates.model !== undefined) {
            fields.push('model = ?');
            values.push(updates.model);
        }
        if (updates.nominalLoad !== undefined) {
            fields.push('nominal_load = ?');
            values.push(updates.nominalLoad);
        }
        if (updates.tensao !== undefined) {
            fields.push('tensao = ?');
            values.push(updates.tensao);
        }
        if (updates.startDate !== undefined) {
            fields.push('start_date = ?');
            values.push(updates.startDate);
        }
        if (updates.endDate !== undefined) {
            fields.push('end_date = ?');
            values.push(updates.endDate);
        }
        if (updates.setup !== undefined) {
            fields.push('setup = ?');
            values.push(updates.setup);
        }
        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.type !== undefined) {
            fields.push('type = ?');
            values.push(updates.type);
        }
        if (updates.observacoes !== undefined) {
            fields.push('observacoes = ?');
            values.push(updates.observacoes);
        }
        if (updates.cycles !== undefined) {
            fields.push('cycles = ?');
            values.push(updates.cycles);
        }
        if (updates.subRowIndex !== undefined) {
            fields.push('sub_row_index = ?');
            values.push(updates.subRowIndex);
        }
        if ((updates as any).plannedSuppliers !== undefined) {
            fields.push('planned_suppliers = ?');
            values.push(JSON.stringify((updates as any).plannedSuppliers));
        }

        if (fields.length === 0) {
            return; // Nenhum campo para atualizar
        }

        values.push(id);
        const sql = `UPDATE safety_scheduled_assays SET ${fields.join(', ')} WHERE id = ?`;
        
        await this.runQuery(sql, values);
    }

    /**
     * Remove um ensaio agendado
     */
    async deleteScheduledAssay(id: number): Promise<void> {
        await this.runQuery('DELETE FROM scheduled_assays WHERE id = ?', [id]);
    }

    /**
     * Remove um ensaio de segurança agendado
     */
    async deleteSafetyScheduledAssay(id: number): Promise<void> {
        await this.runQuery('DELETE FROM safety_scheduled_assays WHERE id = ?', [id]);
    }

    /**
     * Busca ensaios agendados por status
     */
    async getScheduledAssaysByStatus(status: string): Promise<Assay[]> {
        const result = await this.selectQuery(
            'SELECT * FROM scheduled_assays WHERE status = ? ORDER BY start_date',
            [status]
        );
        
        return result.map(assay => {
            let plannedSuppliers = null;
            try {
                plannedSuppliers = JSON.parse(assay.planned_suppliers);
            } catch (error) {
                console.warn(`Erro ao fazer parse do plannedSuppliers para ensaio ${assay.id}:`, error);
                plannedSuppliers = null;
            }

            return {
                id: assay.id,
                protocol: assay.protocol,
                orcamento: assay.orcamento,
                assayManufacturer: assay.assay_manufacturer,
                model: assay.model,
                nominalLoad: assay.nominal_load,
                tensao: assay.tensao,
                startDate: assay.start_date,
                endDate: assay.end_date,
                setup: assay.setup,
                status: assay.status,
                type: assay.type,
                observacoes: assay.observacoes,
                cycles: assay.cycles,
                reportDate: assay.report_date,
                plannedSuppliers: plannedSuppliers,
                lots: { poBase: [], perborato: [], taed: [], tiras: [] }
            };
        });
    }

    /**
     * Busca ensaios agendados por intervalo de datas
     */
    async getScheduledAssaysByDateRange(startDate: string, endDate: string): Promise<Assay[]> {
        const result = await this.selectQuery(
            'SELECT * FROM scheduled_assays WHERE start_date >= ? AND end_date <= ? ORDER BY start_date',
            [startDate, endDate]
        );
        
        return result.map(assay => {
            let plannedSuppliers = null;
            try {
                plannedSuppliers = JSON.parse(assay.planned_suppliers);
            } catch (error) {
                console.warn(`Erro ao fazer parse do plannedSuppliers para ensaio ${assay.id}:`, error);
                plannedSuppliers = null;
            }

            return {
                id: assay.id,
                protocol: assay.protocol,
                orcamento: assay.orcamento,
                assayManufacturer: assay.assay_manufacturer,
                model: assay.model,
                nominalLoad: assay.nominal_load,
                tensao: assay.tensao,
                startDate: assay.start_date,
                endDate: assay.end_date,
                setup: assay.setup,
                status: assay.status,
                type: assay.type,
                observacoes: assay.observacoes,
                cycles: assay.cycles,
                reportDate: assay.report_date,
                plannedSuppliers: plannedSuppliers,
                lots: { poBase: [], perborato: [], taed: [], tiras: [] }
            };
        });
    }

    // ==================== OPERAÇÕES GRANULARES PARA INVENTÁRIO ====================

    /**
     * Cria um novo item de inventário
     */
    async createInventoryItem(item: Omit<InventoryItem, 'id'>): Promise<number> {
        const result = await this.runQuery(
            'INSERT INTO inventory (reagent, manufacturer, lot, quantity, validity) VALUES (?, ?, ?, ?, ?) RETURNING id',
            [
                item.reagent,
                item.manufacturer,
                item.lot,
                item.quantity,
                item.validity
            ]
        );

        return result.id;
    }

    /**
     * Busca um item de inventário por ID
     */
    async getInventoryItemById(id: number): Promise<InventoryItem | null> {
        const result = await this.selectQuery(
            'SELECT * FROM inventory WHERE id = ?',
            [id]
        );

        if (result.length === 0) {
            return null;
        }

        const item = result[0];
        return {
            id: item.id,
            reagent: item.reagent,
            manufacturer: item.manufacturer,
            lot: item.lot,
            quantity: item.quantity,
            validity: item.validity
        };
    }

    /**
     * Busca todos os itens de inventário
     */
    async getAllInventoryItems(): Promise<InventoryItem[]> {
        const result = await this.selectQuery('SELECT * FROM inventory ORDER BY reagent');
        
        return result.map(item => ({
            id: item.id,
            reagent: item.reagent,
            manufacturer: item.manufacturer,
            lot: item.lot,
            quantity: item.quantity,
            validity: item.validity
        }));
    }

    /**
     * Busca itens de inventário por tipo
     */
    async getInventoryItemsByType(type: string): Promise<InventoryItem[]> {
        const result = await this.selectQuery(
            'SELECT * FROM inventory WHERE reagent LIKE ? ORDER BY reagent',
            [`%${type}%`]
        );
        
        return result.map(item => ({
            id: item.id,
            reagent: item.reagent,
            manufacturer: item.manufacturer,
            lot: item.lot,
            quantity: item.quantity,
            validity: item.validity
        }));
    }

    /**
     * Busca itens de inventário com estoque baixo
     */
    async getLowStockItems(): Promise<InventoryItem[]> {
        const result = await this.selectQuery(
            'SELECT * FROM inventory WHERE quantity <= 10 ORDER BY reagent'
        );
        
        return result.map(item => ({
            id: item.id,
            reagent: item.reagent,
            manufacturer: item.manufacturer,
            lot: item.lot,
            quantity: item.quantity,
            validity: item.validity
        }));
    }

    /**
     * Busca itens de inventário próximos ao vencimento
     */
    async getExpiringItems(daysAhead: number = 30): Promise<InventoryItem[]> {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + daysAhead);
        const futureDateString = futureDate.toISOString().split('T')[0];

        const result = await this.selectQuery(
            'SELECT * FROM inventory WHERE validity <= ? AND validity != "" ORDER BY validity',
            [futureDateString]
        );
        
        return result.map(item => ({
            id: item.id,
            reagent: item.reagent,
            manufacturer: item.manufacturer,
            lot: item.lot,
            quantity: item.quantity,
            validity: item.validity
        }));
    }

    /**
     * Atualiza um item de inventário específico
     */
    async updateInventoryItemGranular(id: number, updates: Partial<InventoryItem>): Promise<void> {
        const fields = [];
        const values = [];

        if (updates.reagent !== undefined) {
            fields.push('reagent = ?');
            values.push(updates.reagent);
        }
        if (updates.manufacturer !== undefined) {
            fields.push('manufacturer = ?');
            values.push(updates.manufacturer);
        }
        if (updates.lot !== undefined) {
            fields.push('lot = ?');
            values.push(updates.lot);
        }
        if (updates.quantity !== undefined) {
            fields.push('quantity = ?');
            values.push(updates.quantity);
        }
        if (updates.validity !== undefined) {
            fields.push('validity = ?');
            values.push(updates.validity);
        }

        if (fields.length === 0) {
            return; // Nenhum campo para atualizar
        }

        values.push(id);
        const sql = `UPDATE inventory SET ${fields.join(', ')} WHERE id = ?`;
        
        await this.runQuery(sql, values);
    }

    /**
     * Atualiza a quantidade de um item de inventário
     */
    async updateInventoryQuantity(id: number, newQuantity: number): Promise<void> {
        const currentDate = new Date().toISOString();
        await this.runQuery(
            'UPDATE inventory SET quantity = ?, last_updated = ? WHERE id = ?',
            [newQuantity, currentDate, id]
        );
    }

    /**
     * Adiciona quantidade a um item de inventário
     */
    async addInventoryQuantity(id: number, quantityToAdd: number): Promise<void> {
        const currentDate = new Date().toISOString();
        await this.runQuery(
            'UPDATE inventory SET quantity = quantity + ?, last_updated = ? WHERE id = ?',
            [quantityToAdd, currentDate, id]
        );
    }

    /**
     * Remove quantidade de um item de inventário
     */
    async removeInventoryQuantity(id: number, quantityToRemove: number): Promise<void> {
        const currentDate = new Date().toISOString();
        await this.runQuery(
            'UPDATE inventory SET quantity = MAX(0, quantity - ?), last_updated = ? WHERE id = ?',
            [quantityToRemove, currentDate, id]
        );
    }

    /**
     * Remove um item de inventário
     */
    async deleteInventoryItemGranular(id: number): Promise<void> {
        await this.runQuery('DELETE FROM inventory WHERE id = ?', [id]);
    }

    // ==================== OPERAÇÕES GRANULARES PARA CALIBRAÇÕES ====================

    /**
     * Cria uma nova calibração
     */
    async createCalibration(calibration: Omit<EquipmentCalibration, 'id'>): Promise<number> {
        const result = await this.runQuery(
            'INSERT INTO calibrations (equipment_name, calibration_date, next_calibration_date, status, certificate_number, calibrated_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
            [
                calibration.equipmentName,
                calibration.calibrationDate,
                calibration.nextCalibrationDate,
                calibration.status,
                calibration.certificateNumber,
                calibration.calibratedBy,
                calibration.notes
            ]
        );

        return result.id;
    }

    /**
     * Busca uma calibração por ID
     */
    async getCalibrationById(id: number): Promise<EquipmentCalibration | null> {
        const result = await this.selectQuery(
            'SELECT * FROM calibrations WHERE id = ?',
            [id]
        );

        if (result.length === 0) {
            return null;
        }

        const calibration = result[0];
        return {
            id: calibration.id,
            equipmentName: calibration.equipment_name,
            calibrationDate: calibration.calibration_date,
            nextCalibrationDate: calibration.next_calibration_date,
            status: calibration.status,
            certificateNumber: calibration.certificate_number,
            calibratedBy: calibration.calibrated_by,
            notes: calibration.notes
        };
    }

    /**
     * Busca todas as calibrações
     */
    async getAllCalibrations(): Promise<EquipmentCalibration[]> {
        const result = await this.selectQuery('SELECT * FROM calibrations ORDER BY next_calibration_date');
        
        return result.map(calibration => ({
            id: calibration.id,
            equipmentName: calibration.equipment_name,
            calibrationDate: calibration.calibration_date,
            nextCalibrationDate: calibration.next_calibration_date,
            status: calibration.status,
            certificateNumber: calibration.certificate_number,
            calibratedBy: calibration.calibrated_by,
            notes: calibration.notes
        }));
    }

    /**
     * Busca calibrações por status
     */
    async getCalibrationsByStatus(status: string): Promise<EquipmentCalibration[]> {
        const result = await this.selectQuery(
            'SELECT * FROM calibrations WHERE status = ? ORDER BY next_calibration_date',
            [status]
        );
        
        return result.map(calibration => ({
            id: calibration.id,
            equipmentName: calibration.equipment_name,
            calibrationDate: calibration.calibration_date,
            nextCalibrationDate: calibration.next_calibration_date,
            status: calibration.status,
            certificateNumber: calibration.certificate_number,
            calibratedBy: calibration.calibrated_by,
            notes: calibration.notes
        }));
    }

    /**
     * Busca calibrações próximas ao vencimento
     */
    async getUpcomingCalibrations(daysAhead: number = 30): Promise<EquipmentCalibration[]> {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + daysAhead);
        const futureDateString = futureDate.toISOString().split('T')[0];

        const result = await this.selectQuery(
            'SELECT * FROM calibrations WHERE next_calibration_date <= ? ORDER BY next_calibration_date',
            [futureDateString]
        );
        
        return result.map(calibration => ({
            id: calibration.id,
            equipmentName: calibration.equipment_name,
            calibrationDate: calibration.calibration_date,
            nextCalibrationDate: calibration.next_calibration_date,
            status: calibration.status,
            certificateNumber: calibration.certificate_number,
            calibratedBy: calibration.calibrated_by,
            notes: calibration.notes
        }));
    }

    /**
     * Busca calibrações vencidas
     */
    async getOverdueCalibrations(): Promise<EquipmentCalibration[]> {
        const today = new Date().toISOString().split('T')[0];

        const result = await this.selectQuery(
            'SELECT * FROM calibrations WHERE next_calibration_date < ? ORDER BY next_calibration_date',
            [today]
        );
        
        return result.map(calibration => ({
            id: calibration.id,
            equipmentName: calibration.equipment_name,
            calibrationDate: calibration.calibration_date,
            nextCalibrationDate: calibration.next_calibration_date,
            status: calibration.status,
            certificateNumber: calibration.certificate_number,
            calibratedBy: calibration.calibrated_by,
            notes: calibration.notes
        }));
    }

    /**
     * Atualiza uma calibração específica
     */
    async updateCalibrationGranular(id: number, updates: Partial<EquipmentCalibration>): Promise<void> {
        const fields = [];
        const values = [];

        if (updates.equipmentName !== undefined) {
            fields.push('equipment_name = ?');
            values.push(updates.equipmentName);
        }
        if (updates.calibrationDate !== undefined) {
            fields.push('calibration_date = ?');
            values.push(updates.calibrationDate);
        }
        if (updates.nextCalibrationDate !== undefined) {
            fields.push('next_calibration_date = ?');
            values.push(updates.nextCalibrationDate);
        }
        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.certificateNumber !== undefined) {
            fields.push('certificate_number = ?');
            values.push(updates.certificateNumber);
        }
        if (updates.calibratedBy !== undefined) {
            fields.push('calibrated_by = ?');
            values.push(updates.calibratedBy);
        }
        if (updates.notes !== undefined) {
            fields.push('notes = ?');
            values.push(updates.notes);
        }

        if (fields.length === 0) {
            return; // Nenhum campo para atualizar
        }

        values.push(id);
        const sql = `UPDATE calibrations SET ${fields.join(', ')} WHERE id = ?`;
        
        await this.runQuery(sql, values);
    }

    /**
     * Remove uma calibração
     */
    async deleteCalibrationGranular(id: number): Promise<void> {
        await this.runQuery('DELETE FROM calibrations WHERE id = ?', [id]);
    }

}