import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';

export interface BackupMetadata {
    timestamp: string;
    type: 'full' | 'incremental';
    size: number;
    compressedSize: number;
    checksum: string;
    changes?: ChangeRecord[];
    baseBackup?: string; // Para backups incrementais, referência ao backup base
}

export interface ChangeRecord {
    table: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    recordId: string | number;
    oldData?: any;
    newData?: any;
    timestamp: string;
}

export interface BackupConfig {
    maxBackups: number;
    maxAge: number; // dias
    compressionLevel: number; // 0-9
    incrementalThreshold: number; // número de mudanças para trigger backup incremental
}

export class IncrementalBackup {
    private backupDir: string;
    private metadataFile: string;
    private changeLog: ChangeRecord[] = [];
    private config: BackupConfig;
    private lastBackupHash: string = '';

    constructor(workspaceRoot: string, config?: Partial<BackupConfig>) {
        this.backupDir = path.join(workspaceRoot, '.labcontrol-backups');
        this.metadataFile = path.join(this.backupDir, 'backup-metadata.json');
        
        this.config = {
            maxBackups: 50,
            maxAge: 30, // 30 dias
            compressionLevel: 6,
            incrementalThreshold: 10,
            ...config
        };

        this.ensureBackupDirectory();
        this.loadMetadata();
    }

    /**
     * Garante que o diretório de backup existe
     */
    private ensureBackupDirectory(): void {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
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
            console.warn('[BACKUP] Erro ao carregar metadados:', error);
        }
    }

    /**
     * Salva metadados de backup
     */
    private saveMetadata(backupInfo: BackupMetadata): void {
        try {
            const metadata = {
                lastBackupHash: this.lastBackupHash,
                lastBackup: backupInfo,
                timestamp: new Date().toISOString()
            };
            
            fs.writeFileSync(this.metadataFile, JSON.stringify(metadata, null, 2));
        } catch (error) {
            console.error('[BACKUP] Erro ao salvar metadados:', error);
        }
    }

    /**
     * Registra uma mudança no log
     */
    public logChange(table: string, operation: 'INSERT' | 'UPDATE' | 'DELETE', recordId: string | number, oldData?: any, newData?: any): void {
        const change: ChangeRecord = {
            table,
            operation,
            recordId,
            oldData,
            newData,
            timestamp: new Date().toISOString()
        };

        this.changeLog.push(change);

        // Trigger backup incremental se atingir threshold
        if (this.changeLog.length >= this.config.incrementalThreshold) {
            this.createIncrementalBackup().catch(error => {
                console.error('[BACKUP] Erro ao criar backup incremental automático:', error);
            });
        }
    }

    /**
     * Calcula hash dos dados para detectar mudanças
     */
    private calculateHash(data: any): string {
        const content = typeof data === 'string' ? data : JSON.stringify(data);
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Comprime dados usando gzip
     */
    private compressData(data: string): Buffer {
        return zlib.gzipSync(Buffer.from(data), { level: this.config.compressionLevel });
    }

    /**
     * Descomprime dados
     */
    private decompressData(compressedData: Buffer): string {
        return zlib.gunzipSync(compressedData).toString();
    }

    /**
     * Cria backup completo
     */
    public async createFullBackup(data: any): Promise<string> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `full-backup-${timestamp}.json.gz`;
            const filepath = path.join(this.backupDir, filename);

            const jsonData = JSON.stringify(data, null, 2);
            const dataHash = this.calculateHash(jsonData);
            
            // Verificar se dados mudaram desde último backup
            if (dataHash === this.lastBackupHash) {
                return '';
            }

            const compressedData = this.compressData(jsonData);
            fs.writeFileSync(filepath, compressedData);

            const metadata: BackupMetadata = {
                timestamp,
                type: 'full',
                size: Buffer.byteLength(jsonData),
                compressedSize: compressedData.length,
                checksum: dataHash
            };

            // Salvar arquivo de metadados separado
            const metaFilepath = filepath + '.meta';
            fs.writeFileSync(metaFilepath, JSON.stringify(metadata, null, 2));

            this.lastBackupHash = dataHash;
            this.saveMetadata(metadata);
            this.changeLog = []; // Limpar log após backup completo
            
            // Limpeza automática
            await this.cleanupOldBackups();
            
            return filepath;
        } catch (error) {
            console.error('[BACKUP] Erro ao criar backup completo:', error);
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
            const filename = `incremental-backup-${timestamp}.json.gz`;
            const filepath = path.join(this.backupDir, filename);

            const incrementalData = {
                changes: this.changeLog,
                baseBackup: this.lastBackupHash,
                timestamp
            };

            const jsonData = JSON.stringify(incrementalData, null, 2);
            const compressedData = this.compressData(jsonData);
            fs.writeFileSync(filepath, compressedData);

            const metadata: BackupMetadata = {
                timestamp,
                type: 'incremental',
                size: Buffer.byteLength(jsonData),
                compressedSize: compressedData.length,
                checksum: this.calculateHash(jsonData),
                changes: [...this.changeLog],
                baseBackup: this.lastBackupHash
            };

            // Salvar arquivo de metadados separado
            const metaFilepath = filepath + '.meta';
            fs.writeFileSync(metaFilepath, JSON.stringify(metadata, null, 2));

            this.saveMetadata(metadata);
            this.changeLog = []; // Limpar log após backup
            
            return filepath;
        } catch (error) {
            console.error('[BACKUP] Erro ao criar backup incremental:', error);
            throw error;
        }
    }

    /**
     * Lista todos os backups disponíveis
     */
    public listBackups(): BackupMetadata[] {
        try {
            const backups: BackupMetadata[] = [];
            const files = fs.readdirSync(this.backupDir);
            
            for (const file of files) {
                if (file.endsWith('.meta')) {
                    try {
                        const metaPath = path.join(this.backupDir, file);
                        const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        backups.push(metadata);
                    } catch (error) {
                        console.warn(`[BACKUP] Erro ao ler metadados de ${file}:`, error);
                    }
                }
            }

            // Ordenar por timestamp (mais recente primeiro)
            return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        } catch (error) {
            console.error('[BACKUP] Erro ao listar backups:', error);
            return [];
        }
    }

    /**
     * Restaura backup (completo ou incremental)
     */
    public async restoreBackup(backupPath: string): Promise<any> {
        try {
            if (!fs.existsSync(backupPath)) {
                throw new Error(`Backup não encontrado: ${backupPath}`);
            }

            const compressedData = fs.readFileSync(backupPath);
            const jsonData = this.decompressData(compressedData);
            const data = JSON.parse(jsonData);

            // Verificar se é backup incremental
            if (data.changes && data.baseBackup) {
                throw new Error('Restauração de backup incremental requer implementação específica');
            }

            return data;
        } catch (error) {
            console.error('[BACKUP] Erro ao restaurar backup:', error);
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

            // Limpeza silenciosa - logs removidos para reduzir verbosidade
        } catch (error) {
            console.error('[BACKUP] Erro na limpeza de backups:', error);
        }
    }

    /**
     * Encontra arquivo de backup por timestamp e tipo
     */
    private findBackupFile(timestamp: string, type: 'full' | 'incremental'): string {
        const prefix = type === 'full' ? 'full-backup-' : 'incremental-backup-';
        const filename = `${prefix}${timestamp}.json.gz`;
        const filepath = path.join(this.backupDir, filename);
        
        return fs.existsSync(filepath) ? filepath : '';
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
     * Obtém estatísticas dos backups
     */
    public getBackupStats(): any {
        const backups = this.listBackups();
        const totalSize = backups.reduce((sum, backup) => sum + backup.compressedSize, 0);
        const fullBackups = backups.filter(b => b.type === 'full').length;
        const incrementalBackups = backups.filter(b => b.type === 'incremental').length;

        return {
            totalBackups: backups.length,
            fullBackups,
            incrementalBackups,
            totalSize: this.formatBytes(totalSize),
            oldestBackup: backups.length > 0 ? backups[backups.length - 1].timestamp : null,
            newestBackup: backups.length > 0 ? backups[0].timestamp : null,
            pendingChanges: this.changeLog.length
        };
    }
}