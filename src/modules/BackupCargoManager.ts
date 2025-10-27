/**
 * Sistema de Backup para o Módulo de Controle de Carga
 * 
 * Gerencia backups automáticos e incrementais específicos para o banco cargo.sqlite,
 * salvando em pasta separada (.cargo-backups) do sistema principal.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';

export interface CargoBackupMetadata {
    timestamp: string;
    type: 'full' | 'incremental';
    size: number;
    compressedSize: number;
    checksum: string;
    changes?: CargoChangeRecord[];
    baseBackup?: string;
    tables: string[];
    recordCount: number;
}

export interface CargoChangeRecord {
    table: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    recordId: string | number;
    oldData?: any;
    newData?: any;
    timestamp: string;
}

export interface CargoBackupConfig {
    maxBackups: number;
    maxAge: number; // dias
    compressionLevel: number; // 0-9
    incrementalThreshold: number; // número de mudanças para trigger backup incremental
    autoBackupInterval: number; // horas
}

export class BackupCargoManager {
    private workspaceRoot: string;
    private backupDir: string;
    private metadataFile: string;
    private changeLog: CargoChangeRecord[] = [];
    private config: CargoBackupConfig;
    private lastBackupHash: string = '';
    private autoBackupInterval: NodeJS.Timeout | null = null;

    constructor(workspaceRoot: string, config?: Partial<CargoBackupConfig>) {
        this.workspaceRoot = workspaceRoot;
        // Pasta separada para backups do Controle de Carga
        this.backupDir = path.join(workspaceRoot, '.cargo-backups');
        this.metadataFile = path.join(this.backupDir, 'cargo-backup-metadata.json');
        
        this.config = {
            maxBackups: 30,
            maxAge: 30, // 30 dias
            compressionLevel: 6,
            incrementalThreshold: 5, // Menor threshold para cargo
            autoBackupInterval: 4, // A cada 4 horas
            ...config
        };

        this.ensureBackupDirectory();
        this.loadMetadata();
    }

    // ============================================================================
    // INICIALIZAÇÃO E CONFIGURAÇÃO
    // ============================================================================

    /**
     * Garante que o diretório de backup existe
     */
    private ensureBackupDirectory(): void {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
            console.log(`[CARGO-BACKUP] Diretório criado: ${this.backupDir}`);
        }
    }

    /**
     * Carrega metadados de backups existentes
     */
    private loadMetadata(): void {
        try {
            if (fs.existsSync(this.metadataFile)) {
                const metadata = JSON.parse(fs.readFileSync(this.metadataFile, 'utf8'));
                this.lastBackupHash = metadata.lastBackupHash || '';
            }
        } catch (error) {
            console.warn('[CARGO-BACKUP] Erro ao carregar metadados:', error);
        }
    }

    /**
     * Salva metadados de backup
     */
    private saveMetadata(backupInfo: CargoBackupMetadata): void {
        try {
            const metadata = {
                lastBackupHash: this.lastBackupHash,
                lastBackup: backupInfo,
                timestamp: new Date().toISOString(),
                module: 'cargo-control'
            };
            
            fs.writeFileSync(this.metadataFile, JSON.stringify(metadata, null, 2));
        } catch (error) {
            console.error('[CARGO-BACKUP] Erro ao salvar metadados:', error);
        }
    }

    // ============================================================================
    // LOGGING DE MUDANÇAS
    // ============================================================================

    /**
     * Registra uma mudança no log
     */
    public logChange(
        operation: 'INSERT' | 'UPDATE' | 'DELETE',
        table: string, 
        recordId: string | number, 
        data?: any
    ): void {
        const change: CargoChangeRecord = {
            table,
            operation,
            recordId,
            oldData: operation === 'DELETE' ? data : undefined,
            newData: operation !== 'DELETE' ? data : undefined,
            timestamp: new Date().toISOString()
        };

        this.changeLog.push(change);

        // Trigger backup incremental se atingir threshold
        if (this.changeLog.length >= this.config.incrementalThreshold) {
            this.createIncrementalBackup().catch(error => {
                console.error('[CARGO-BACKUP] Erro ao criar backup incremental automático:', error);
            });
        }
    }

    // ============================================================================
    // CRIAÇÃO DE BACKUPS
    // ============================================================================

    /**
     * Cria backup completo dos dados do cargo
     */
    public async createFullBackup(): Promise<string> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `cargo-full-backup-${timestamp}.json.gz`;
            const filepath = path.join(this.backupDir, filename);

            // Obter dados do banco cargo.sqlite
            const cargoData = await this.readCargoDatabase();
            
            // Adicionar informações específicas do módulo cargo
            const backupData = {
                module: 'cargo-control',
                version: '1.0.0',
                timestamp,
                data: cargoData,
                tables: this.extractTableNames(cargoData),
                recordCount: this.countRecords(cargoData)
            };

            const jsonData = JSON.stringify(backupData, null, 2);
            const compressedData = this.compressData(jsonData);
            fs.writeFileSync(filepath, compressedData);

            const checksum = this.calculateHash(jsonData);
            this.lastBackupHash = checksum;

            const metadata: CargoBackupMetadata = {
                timestamp,
                type: 'full',
                size: Buffer.byteLength(jsonData),
                compressedSize: compressedData.length,
                checksum,
                tables: backupData.tables,
                recordCount: backupData.recordCount
            };

            // Salvar arquivo de metadados separado
            const metaFilepath = filepath + '.meta';
            fs.writeFileSync(metaFilepath, JSON.stringify(metadata, null, 2));

            this.saveMetadata(metadata);
            this.changeLog = []; // Limpar log após backup completo
            
            console.log(`[CARGO-BACKUP] Backup completo criado: ${filename} (${this.formatBytes(compressedData.length)})`);
            return filepath;
        } catch (error) {
            console.error('[CARGO-BACKUP] Erro ao criar backup completo:', error);
            throw error;
        }
    }

    /**
     * Cria backup incremental
     */
    public async createIncrementalBackup(): Promise<string> {
        try {
            if (this.changeLog.length === 0) {
                return '';
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `cargo-incremental-backup-${timestamp}.json.gz`;
            const filepath = path.join(this.backupDir, filename);

            const incrementalData = {
                module: 'cargo-control',
                changes: this.changeLog,
                baseBackup: this.lastBackupHash,
                timestamp,
                changeCount: this.changeLog.length
            };

            const jsonData = JSON.stringify(incrementalData, null, 2);
            const compressedData = this.compressData(jsonData);
            fs.writeFileSync(filepath, compressedData);

            const metadata: CargoBackupMetadata = {
                timestamp,
                type: 'incremental',
                size: Buffer.byteLength(jsonData),
                compressedSize: compressedData.length,
                checksum: this.calculateHash(jsonData),
                changes: [...this.changeLog],
                baseBackup: this.lastBackupHash,
                tables: [...new Set(this.changeLog.map(c => c.table))],
                recordCount: this.changeLog.length
            };

            // Salvar arquivo de metadados separado
            const metaFilepath = filepath + '.meta';
            fs.writeFileSync(metaFilepath, JSON.stringify(metadata, null, 2));

            this.saveMetadata(metadata);
            this.changeLog = []; // Limpar log após backup
            
            console.log(`[CARGO-BACKUP] Backup incremental criado: ${filename} (${metadata.recordCount} mudanças)`);
            return filepath;
        } catch (error) {
            console.error('[CARGO-BACKUP] Erro ao criar backup incremental:', error);
            throw error;
        }
    }

    // ============================================================================
    // BACKUP AUTOMÁTICO
    // ============================================================================

    /**
     * Inicia backup automático
     */
    public async startAutomaticBackup(): Promise<void> {
        if (this.autoBackupInterval) {
            clearInterval(this.autoBackupInterval);
        }

        // Backup inicial após 2 minutos
        setTimeout(async () => {
            try {
                await this.createFullBackup();
            } catch (error) {
                console.error('[CARGO-BACKUP] Erro no backup inicial:', error);
            }
        }, 2 * 60 * 1000);

        // Backup automático a cada X horas
        const intervalMs = this.config.autoBackupInterval * 60 * 60 * 1000;
        this.autoBackupInterval = setInterval(async () => {
            try {
                await this.createFullBackup();
                await this.cleanupOldBackups();
            } catch (error) {
                console.error('[CARGO-BACKUP] Erro no backup automático:', error);
            }
        }, intervalMs);

        console.log(`[CARGO-BACKUP] Backup automático iniciado (a cada ${this.config.autoBackupInterval}h)`);
    }

    /**
     * Para o backup automático
     */
    public stopAutomaticBackup(): void {
        if (this.autoBackupInterval) {
            clearInterval(this.autoBackupInterval);
            this.autoBackupInterval = null;
            console.log('[CARGO-BACKUP] Backup automático parado');
        }
    }

    // ============================================================================
    // GERENCIAMENTO DE BACKUPS
    // ============================================================================

    /**
     * Lista todos os backups disponíveis
     */
    public listBackups(): CargoBackupMetadata[] {
        try {
            const backups: CargoBackupMetadata[] = [];
            const files = fs.readdirSync(this.backupDir);
            
            for (const file of files) {
                if (file.endsWith('.meta') && file.includes('cargo-')) {
                    try {
                        const metaPath = path.join(this.backupDir, file);
                        const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        backups.push(metadata);
                    } catch (error) {
                        console.warn(`[CARGO-BACKUP] Erro ao ler metadados de ${file}:`, error);
                    }
                }
            }

            // Ordenar por timestamp (mais recente primeiro)
            return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        } catch (error) {
            console.error('[CARGO-BACKUP] Erro ao listar backups:', error);
            return [];
        }
    }

    /**
     * Restaura backup
     */
    public async restoreBackup(backupPath: string): Promise<any> {
        try {
            if (!fs.existsSync(backupPath)) {
                throw new Error(`Backup não encontrado: ${backupPath}`);
            }

            const compressedData = fs.readFileSync(backupPath);
            const jsonData = this.decompressData(compressedData);
            const data = JSON.parse(jsonData);

            // Verificar se é backup do módulo cargo
            if (data.module !== 'cargo-control') {
                throw new Error('Backup não é do módulo Controle de Carga');
            }

            // Verificar se é backup incremental
            if (data.changes && data.baseBackup) {
                throw new Error('Restauração de backup incremental requer implementação específica');
            }

            console.log(`[CARGO-BACKUP] Backup restaurado: ${path.basename(backupPath)}`);
            return data.data || data;
        } catch (error) {
            console.error('[CARGO-BACKUP] Erro ao restaurar backup:', error);
            throw error;
        }
    }

    /**
     * Limpeza automática de backups antigos
     */
    public async cleanupOldBackups(): Promise<void> {
        try {
            const backups = this.listBackups();
            const now = new Date();
            const maxAgeMs = this.config.maxAge * 24 * 60 * 60 * 1000;

            let deletedCount = 0;
            let deletedSize = 0;

            // Remover backups por idade
            for (const backup of backups) {
                const backupDate = new Date(backup.timestamp);
                const age = now.getTime() - backupDate.getTime();

                if (age > maxAgeMs) {
                    const backupFile = this.findBackupFile(backup.timestamp, backup.type);
                    const metaFile = backupFile + '.meta';

                    if (backupFile && fs.existsSync(backupFile)) {
                        deletedSize += fs.statSync(backupFile).size;
                        fs.unlinkSync(backupFile);
                        deletedCount++;
                    }

                    if (fs.existsSync(metaFile)) {
                        fs.unlinkSync(metaFile);
                    }
                }
            }

            // Remover backups excedentes (manter apenas maxBackups mais recentes)
            const remainingBackups = this.listBackups();
            if (remainingBackups.length > this.config.maxBackups) {
                const toDelete = remainingBackups.slice(this.config.maxBackups);
                
                for (const backup of toDelete) {
                    const backupFile = this.findBackupFile(backup.timestamp, backup.type);
                    const metaFile = backupFile + '.meta';

                    if (backupFile && fs.existsSync(backupFile)) {
                        deletedSize += fs.statSync(backupFile).size;
                        fs.unlinkSync(backupFile);
                        deletedCount++;
                    }

                    if (fs.existsSync(metaFile)) {
                        fs.unlinkSync(metaFile);
                    }
                }
            }

            if (deletedCount > 0) {
                console.log(`[CARGO-BACKUP] Limpeza: ${deletedCount} backups removidos (${this.formatBytes(deletedSize)})`);
            }
        } catch (error) {
            console.error('[CARGO-BACKUP] Erro na limpeza de backups:', error);
        }
    }

    /**
     * Obtém estatísticas dos backups
     */
    public getBackupStats(): any {
        const backups = this.listBackups();
        const totalSize = backups.reduce((sum, backup) => sum + backup.compressedSize, 0);
        const fullBackups = backups.filter(b => b.type === 'full').length;
        const incrementalBackups = backups.filter(b => b.type === 'incremental').length;

        return {
            module: 'cargo-control',
            totalBackups: backups.length,
            fullBackups,
            incrementalBackups,
            totalSize: this.formatBytes(totalSize),
            oldestBackup: backups.length > 0 ? backups[backups.length - 1].timestamp : null,
            newestBackup: backups.length > 0 ? backups[0].timestamp : null,
            pendingChanges: this.changeLog.length,
            backupDirectory: this.backupDir
        };
    }

    // ============================================================================
    // MÉTODOS UTILITÁRIOS
    // ============================================================================

    /**
     * Encontra arquivo de backup por timestamp e tipo
     */
    private findBackupFile(timestamp: string, type: 'full' | 'incremental'): string {
        const prefix = type === 'full' ? 'cargo-full-backup-' : 'cargo-incremental-backup-';
        const filename = `${prefix}${timestamp}.json.gz`;
        const filepath = path.join(this.backupDir, filename);
        
        return fs.existsSync(filepath) ? filepath : '';
    }

    /**
     * Comprime dados usando gzip
     */
    private compressData(data: string): Buffer {
        return zlib.gzipSync(Buffer.from(data), { level: this.config.compressionLevel });
    }

    /**
     * Descomprime dados gzip
     */
    private decompressData(compressedData: Buffer): string {
        return zlib.gunzipSync(compressedData).toString();
    }

    /**
     * Calcula hash MD5 dos dados
     */
    private calculateHash(data: string): string {
        return crypto.createHash('md5').update(data).digest('hex');
    }

    /**
     * Formata bytes em formato legível
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Extrai nomes das tabelas dos dados
     */
    private extractTableNames(data: any): string[] {
        if (!data || typeof data !== 'object') return [];
        return Object.keys(data).filter(key => Array.isArray(data[key]));
    }

    /**
     * Conta total de registros nos dados
     */
    private countRecords(data: any): number {
        if (!data || typeof data !== 'object') return 0;
        return Object.values(data).reduce((total: number, value) => {
            return total + (Array.isArray(value) ? value.length : 0);
        }, 0);
    }

    /**
     * Lê dados do banco cargo.sqlite
     */
    private async readCargoDatabase(): Promise<any> {
        const sqlite3 = require('sqlite3');
        const cargoDbPath = path.join(this.workspaceRoot, 'cargo.sqlite');
        
        return new Promise((resolve, reject) => {
            // Verificar se o banco existe
            if (!fs.existsSync(cargoDbPath)) {
                console.log('[CARGO-BACKUP] Banco cargo.sqlite não encontrado, criando backup vazio');
                resolve({
                    pecas_carga: [],
                    carga_ensaio: []
                });
                return;
            }

            const db = new sqlite3.Database(cargoDbPath, sqlite3.OPEN_READONLY, (err: any) => {
                if (err) {
                    console.error('[CARGO-BACKUP] Erro ao conectar ao banco:', err);
                    reject(err);
                    return;
                }

                const data: any = {};

                // Ler tabela pecas_carga
                db.all('SELECT * FROM pecas_carga', (err: any, rows: any[]) => {
                    if (err) {
                        console.error('[CARGO-BACKUP] Erro ao ler pecas_carga:', err);
                        data.pecas_carga = [];
                    } else {
                        data.pecas_carga = rows;
                    }

                    // Ler tabela carga_ensaio
                    db.all('SELECT * FROM carga_ensaio', (err: any, rows: any[]) => {
                        if (err) {
                            console.error('[CARGO-BACKUP] Erro ao ler carga_ensaio:', err);
                            data.carga_ensaio = [];
                        } else {
                            data.carga_ensaio = rows;
                        }

                        db.close((err: any) => {
                            if (err) {
                                console.error('[CARGO-BACKUP] Erro ao fechar banco:', err);
                            }
                            resolve(data);
                        });
                    });
                });
            });
        });
    }
}