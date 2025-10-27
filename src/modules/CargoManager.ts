/**
 * Gerenciador do Módulo de Carga - Arquitetura Híbrida
 * 
 * Responsável por gerenciar o banco de dados específico de peças, cargas e preparações,
 * separado do módulo principal.
 */

import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { 
    ICargoManager, 
    IModuleDatabase, 
    PecaCarga, 
    CargaEnsaio 
} from '../HybridDatabaseArchitecture';
import { BackupCargoManager } from './BackupCargoManager';

export class CargoManager implements ICargoManager, IModuleDatabase {
    private db: sqlite3.Database | null = null;
    private dbPath: string;
    private isInitialized: boolean = false;
    private backupManager: BackupCargoManager;
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.dbPath = path.join(workspaceRoot, 'cargo.sqlite');
        this.backupManager = new BackupCargoManager(workspaceRoot);
    }

    // ============================================================================
    // INICIALIZAÇÃO E CONEXÃO
    // ============================================================================

    async connect(): Promise<void> {
        if (this.db) {
            return;
        }

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Erro ao conectar ao banco de carga:', err);
                    reject(err);
                } else {
                    console.log('Conectado ao banco de carga:', this.dbPath);
                    resolve();
                }
            });
        });
    }
    

    async disconnect(): Promise<void> {
        if (!this.db) {
            return;
        }

        return new Promise((resolve, reject) => {
            this.db!.close((err) => {
                if (err) {
                    console.error('Erro ao fechar banco de carga:', err);
                    reject(err);
                } else {
                    console.log('Banco de carga fechado');
                    this.db = null;
                    resolve();
                }
            });
        });
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        await this.connect();
        await this.createTables();
        await this.runMigrations();
        
        // Inicializar sistema de backup automático
        await this.backupManager.startAutomaticBackup();
        
        this.isInitialized = true;
        console.log('CargoManager inicializado com sucesso');
    }

    async close(): Promise<void> {
        // Parar sistema de backup automático
        this.backupManager.stopAutomaticBackup();
        
        await this.disconnect();
        this.isInitialized = false;
    }

    // ============================================================================
    // CRIAÇÃO DE TABELAS
    // ============================================================================

    private async createTables(): Promise<void> {
        const tables = [
            this.createPecasCargaTable(),
            this.createCargaEnsaioTable(),
            this.createCargoIndexes()
        ];

        for (const tableSQL of tables) {
            await this.runQuery(tableSQL);
        }
    }

    private createPecasCargaTable(): string {
        return `
            CREATE TABLE IF NOT EXISTS pecas_carga (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tag_id TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL,
                cycles INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'ativa',
                acquisition_date TEXT
            )
        `;
    }

    private createCargaEnsaioTable(): string {
        return `
            CREATE TABLE IF NOT EXISTS carga_ensaio (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
            protocolo TEXT NOT NULL,
            peca_id INTEGER NOT NULL,
            tipo_ciclo TEXT,
            vinculo_status TEXT NOT NULL DEFAULT 'ativo',
            ciclos_no_vinculo INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (peca_id) REFERENCES pecas_carga(id)
            )
        `;
    }





    private createCargoIndexes(): string {
        return `
            CREATE INDEX IF NOT EXISTS idx_pecas_tag_id ON pecas_carga(tag_id);
            CREATE INDEX IF NOT EXISTS idx_pecas_status ON pecas_carga(status);
            CREATE INDEX IF NOT EXISTS idx_pecas_type ON pecas_carga(type);
            CREATE INDEX IF NOT EXISTS idx_pecas_cycles ON pecas_carga(cycles);
            CREATE INDEX IF NOT EXISTS idx_carga_peca_id ON carga_ensaio(peca_id);
            CREATE INDEX IF NOT EXISTS idx_carga_protocolo ON carga_ensaio(protocolo);
            CREATE INDEX IF NOT EXISTS idx_carga_tipo_ciclo ON carga_ensaio(tipo_ciclo);
            CREATE INDEX IF NOT EXISTS idx_carga_vinculo_status ON carga_ensaio(vinculo_status);
            CREATE INDEX IF NOT EXISTS idx_carga_created_at ON carga_ensaio(created_at);
            CREATE INDEX IF NOT EXISTS idx_carga_protocolo_created_at ON carga_ensaio(protocolo, created_at);
        `;
    }

    // ============================================================================
    // OPERAÇÕES DE PEÇAS
    // ============================================================================

    /**
     * Verifica quais peças já existem no banco de dados
     */
    async checkExistingPecas(tagIds: string[]): Promise<string[]> {
        if (tagIds.length === 0) return [];
        
        const placeholders = tagIds.map(() => '?').join(',');
        const sql = `SELECT tag_id FROM pecas_carga WHERE tag_id IN (${placeholders})`;
        const results = await this.runQuery(sql, tagIds);
        
        return results.map((row: any) => row.tag_id);
    }

    /**
     * Adiciona múltiplas peças, verificando duplicatas
     */
    async addMultiplePecas(pecas: Array<{ tag_id: string; type: string; acquisition_date?: string }>): Promise<{
        success: boolean;
        addedPecas: Array<{ tag_id: string; id: number }>;
        existingPecas: string[];
        message: string;
    }> {
        if (pecas.length === 0) {
            return {
                success: false,
                addedPecas: [],
                existingPecas: [],
                message: 'Nenhuma peça fornecida para cadastro'
            };
        }

        // Verificar quais peças já existem
        const tagIds = pecas.map(p => p.tag_id);
        const existingPecas = await this.checkExistingPecas(tagIds);
        
        // Filtrar apenas as peças que não existem
        const newPecas = pecas.filter(p => !existingPecas.includes(p.tag_id));
        
        const addedPecas: Array<{ tag_id: string; id: number }> = [];
        
        // Adicionar apenas as peças novas
        for (const peca of newPecas) {
            try {
                const id = await this.addPeca(peca);
                addedPecas.push({ tag_id: peca.tag_id, id });
            } catch (error) {
                console.error(`Erro ao adicionar peça ${peca.tag_id}:`, error);
            }
        }

        let message = '';
        if (addedPecas.length > 0 && existingPecas.length > 0) {
            message = `${addedPecas.length} peça(s) cadastrada(s) com sucesso. ${existingPecas.length} peça(s) já existiam no banco.`;
        } else if (addedPecas.length > 0) {
            message = `${addedPecas.length} peça(s) cadastrada(s) com sucesso!`;
        } else if (existingPecas.length > 0) {
            message = `Todas as peças já existem no banco de dados.`;
        } else {
            message = 'Nenhuma peça foi processada.';
        }

        return {
            success: addedPecas.length > 0,
            addedPecas,
            existingPecas,
            message
        };
    }

    async addPeca(peca: { tag_id: string; type: string; acquisition_date?: string }): Promise<number> {
        const sql = `
            INSERT INTO pecas_carga (
                tag_id, type, cycles, status, acquisition_date
            ) VALUES (?, ?, ?, ?, ?)
        `;

        const params = [
            peca.tag_id,
            peca.type,
            0, // cycles iniciais
            'ativa', // status padrão
            peca.acquisition_date || new Date().toISOString().split('T')[0]
        ];

        const result = await this.runQuery(sql, params);
        
        // Log para backup incremental
        this.backupManager.logChange('INSERT', 'pecas_carga', result.lastID, {
            tag_id: peca.tag_id,
            type: peca.type,
            cycles: 0,
            status: 'ativa',
            acquisition_date: peca.acquisition_date || new Date().toISOString().split('T')[0]
        });
        
        return result.lastID;
    }

    async updatePeca(id: number, updates: { tag_id?: string; type?: string; cycles?: number; status?: string; acquisition_date?: string }): Promise<void> {
        const allowedFields = ['tag_id', 'type', 'cycles', 'status', 'acquisition_date'];

        const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));
        
        if (updateFields.length === 0) {
            throw new Error('Nenhum campo válido para atualização');
        }

        const setClause = updateFields.map(field => `${field} = ?`).join(', ');
        const sql = `UPDATE pecas_carga SET ${setClause} WHERE id = ?`;
        
        const params = [...updateFields.map(field => updates[field as keyof typeof updates]), id];
        
        await this.runQuery(sql, params);
        
        // Log para backup incremental
        this.backupManager.logChange('UPDATE', 'pecas_carga', id, updates);
    }

    async deletePeca(id: number): Promise<void> {
        const sql = `DELETE FROM pecas_carga WHERE id = ?`;
        await this.runQuery(sql, [id]);
        
        // Log para backup incremental
        this.backupManager.logChange('DELETE', 'pecas_carga', id, null);
    }

    async getPecaById(id: number): Promise<PecaCarga | null> {
        const sql = `SELECT * FROM pecas_carga WHERE id = ?`;
        const results = await this.runQuery(sql, [id]);
        return results.length > 0 ? results[0] : null;
    }

    async getPecaByTagId(tagId: string): Promise<PecaCarga | null> {
        const sql = `SELECT * FROM pecas_carga WHERE tag_id = ?`;
        const results = await this.runQuery(sql, [tagId]);
        return results.length > 0 ? results[0] : null;
    }

    async getAllPecas(): Promise<PecaCarga[]> {
        const sql = `
            SELECT * FROM pecas_carga 
            ORDER BY acquisition_date DESC, tag_id
        `;
        return this.runQuery(sql);
    }

    async getPecasByStatus(status: string): Promise<PecaCarga[]> {
        const sql = `
            SELECT * FROM pecas_carga 
            WHERE status = ?
            ORDER BY acquisition_date DESC
        `;
        return this.runQuery(sql, [status]);
    }

    async updatePecaStatus(tagId: string, status: string): Promise<void> {
        const sql = `
            UPDATE pecas_carga 
            SET status = ?, status_updated_date = datetime('now')
            WHERE tag_id = ?
        `;
        await this.runQuery(sql, [status, tagId]);
    }

    async bulkDeleteInactivePiecesByYear(year: string): Promise<number> {
        // First, get the count of pieces to be deleted
        const countSql = `
            SELECT COUNT(*) as count
            FROM pecas_carga 
            WHERE status = 'inativa' 
            AND strftime('%Y', status_updated_date) = ?
        `;
        const countResult = await this.runQuery(countSql, [year]);
        const count = countResult[0]?.count || 0;

        if (count === 0) {
            return 0;
        }

        // Delete the pieces
        const deleteSql = `
            DELETE FROM pecas_carga 
            WHERE status = 'inativa' 
            AND strftime('%Y', status_updated_date) = ?
        `;
        await this.runQuery(deleteSql, [year]);

        return count;
    }

    async bulkDeleteProtocolsByYear(year: string): Promise<number> {
        // First, get the count of protocols to be deleted
        const countSql = `
            SELECT COUNT(DISTINCT protocolo) as count
            FROM carga_ensaio 
            WHERE strftime('%Y', created_at) = ?
        `;
        const countResult = await this.runQuery(countSql, [year]);
        const count = countResult[0]?.count || 0;

        if (count === 0) {
            return 0;
        }

        // Delete the protocols and their associated data
        const deleteSql = `
            DELETE FROM carga_ensaio 
            WHERE strftime('%Y', created_at) = ?
        `;
        await this.runQuery(deleteSql, [year]);

        return count;
    }

    // ============================================================================
    // OPERAÇÕES DE CARGA DE ENSAIO
    // ============================================================================

    async addCargaEnsaio(carga: { peca_id: number; protocolo: string; tipo_ciclo: string; vinculo_status?: string }): Promise<number> {
        const sql = `
            INSERT INTO carga_ensaio (
                peca_id, protocolo, tipo_ciclo, vinculo_status, created_at
            ) VALUES (?, ?, ?, ?, datetime('now'))
        `;

        const params = [
            carga.peca_id,
            carga.protocolo,
            carga.tipo_ciclo,
            carga.vinculo_status || 'ativo'
        ];

        const result = await this.runQuery(sql, params);
        
        // Log para backup incremental
        this.backupManager.logChange('INSERT', 'carga_ensaio', result.lastID, {
            peca_id: carga.peca_id,
            protocolo: carga.protocolo,
            tipo_ciclo: carga.tipo_ciclo,
            vinculo_status: carga.vinculo_status || 'ativo'
        });
        
        return result.lastID;
    }

    async updateCargaEnsaio(id: number, updates: { protocolo?: string; tipo_ciclo?: string; vinculo_status?: string }): Promise<void> {
        const allowedFields = ['protocolo', 'tipo_ciclo', 'vinculo_status'];

        const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));
        
        if (updateFields.length === 0) {
            throw new Error('Nenhum campo válido para atualização');
        }

        const setClause = updateFields.map(field => `${field} = ?`).join(', ');
        const sql = `UPDATE carga_ensaio SET ${setClause} WHERE id = ?`;
        
        const params = [...updateFields.map(field => updates[field as keyof typeof updates]), id];
        
        await this.runQuery(sql, params);
        
        // Log para backup incremental
        this.backupManager.logChange('UPDATE', 'carga_ensaio', id, updates);
    }

    async deleteCargaEnsaio(id: number): Promise<void> {
        const sql = `DELETE FROM carga_ensaio WHERE id = ?`;
        await this.runQuery(sql, [id]);
        
        // Log para backup incremental
        this.backupManager.logChange('DELETE', 'carga_ensaio', id, null);
    }

    async getCargaEnsaioById(id: number): Promise<CargaEnsaio | null> {
        const sql = `SELECT * FROM carga_ensaio WHERE id = ?`;
        const results = await this.runQuery(sql, [id]);
        return results.length > 0 ? results[0] : null;
    }

    async getCargasByPeca(pecaId: number): Promise<CargaEnsaio[]> {
        const sql = `
            SELECT * FROM carga_ensaio 
            WHERE peca_id = ?
            ORDER BY id DESC
        `;
        return this.runQuery(sql, [pecaId]);
    }

    async getCargasByStatus(status: string): Promise<CargaEnsaio[]> {
        const sql = `
            SELECT ce.*, pc.tag_id, pc.type
            FROM carga_ensaio ce
            JOIN pecas_carga pc ON ce.peca_id = pc.id
            WHERE ce.vinculo_status = ?
            ORDER BY ce.id DESC
        `;
        return this.runQuery(sql, [status]);
    }







    // ============================================================================
    // OPERAÇÕES DE RELATÓRIOS
    // ============================================================================

    async getCargoReport(filters?: any): Promise<any> {
        const sql = `
            SELECT 
                pc.tag_id,
                pc.type,
                pc.status,
                pc.cycles,
                pc.acquisition_date,
                COUNT(ce.id) as total_cargas,
                COUNT(CASE WHEN ce.vinculo_status = 'ativo' THEN 1 END) as cargas_ativas,
                COUNT(CASE WHEN ce.vinculo_status = 'inativo' THEN 1 END) as cargas_inativas
            FROM pecas_carga pc
            LEFT JOIN carga_ensaio ce ON pc.id = ce.peca_id
            GROUP BY pc.id
            ORDER BY pc.acquisition_date DESC
        `;

        return this.runQuery(sql);
    }

    async getPecaDetails(tagId: string): Promise<any> {
        const sql = `
            SELECT 
                pc.*,
                COUNT(DISTINCT ce.id) as total_cargas,
                COUNT(DISTINCT CASE WHEN ce.vinculo_status = 'ativo' THEN ce.id END) as cargas_ativas
            FROM pecas_carga pc
            LEFT JOIN carga_ensaio ce ON pc.id = ce.peca_id
            WHERE pc.tag_id = ?
            GROUP BY pc.id
        `;

        const results = await this.runQuery(sql, [tagId]);
        if (results.length === 0) {
            return null;
        }

        const peca = results[0];

        // Buscar cargas relacionadas
        const cargas = await this.runQuery(`
            SELECT * FROM carga_ensaio 
            WHERE peca_id = ?
            ORDER BY id DESC
        `, [peca.id]);

        return {
            ...peca,
            cargas
        };
    }

    // ============================================================================
    // BACKUP
    // ============================================================================

    async createBackup(backupPath: string): Promise<void> {
        if (!this.db) {
            throw new Error('Banco de dados não conectado');
        }

        return new Promise((resolve, reject) => {
            // Usar VACUUM INTO para criar backup (disponível no SQLite 3.27+)
            const sql = `VACUUM INTO '${backupPath}'`;
            
            this.db!.run(sql, (err: any) => {
                if (err) {
                    reject(new Error(`Erro ao criar backup: ${err.message}`));
                } else {
                    console.log(`Backup do módulo de carga criado: ${backupPath}`);
                    resolve();
                }
            });
        });
    }

    // ============================================================================
    // MÉTODOS DE VALIDAÇÃO PARA MIGRAÇÃO
    // ============================================================================

    async validateReferentialIntegrity(): Promise<{ 
        isValid: boolean; 
        errors: string[];
        orphanedAssays: any[];
    }> {
        const errors: string[] = [];

        try {
            // Verificar ensaios de carga órfãos
            const orphanedAssays = await this.runQuery(`
                SELECT ce.id, ce.protocolo 
                FROM carga_ensaio ce 
                LEFT JOIN pecas_carga pc ON ce.peca_id = pc.id 
                WHERE pc.id IS NULL
            `);

            if (orphanedAssays.length > 0) {
                errors.push(
                    `Ensaios de carga órfãos encontrados: ${orphanedAssays.map((a: any) => a.id).join(', ')}`
                );
            }

            return {
                isValid: errors.length === 0,
                errors,
                orphanedAssays
            };
        } catch (error) {
            return {
                isValid: false,
                errors: [`Erro ao validar integridade: ${error instanceof Error ? error.message : String(error)}`],
                orphanedAssays: []
            };
        }
    }

    async getTableRecordCount(tableName: string): Promise<number> {
        const result = await this.runQuery(`SELECT COUNT(*) as count FROM ${tableName}`);
        return result[0]?.count || 0;
    }

    // Métodos públicos para migração
    async getTableData(tableName: string): Promise<any[]> {
        return this.runQuery(`SELECT * FROM ${tableName}`);
    }

    async insertTableData(tableName: string, data: any[]): Promise<void> {
        if (data.length === 0) return;

        const columns = Object.keys(data[0]);
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;

        await this.runTransaction(async () => {
            for (const row of data) {
                const values = columns.map(col => row[col]);
                await this.runQuery(sql, values);
            }
        });
    }



    async getAllPecasAtivas(): Promise<PecaCarga[]> {
        const sql = `
            SELECT * FROM pecas_carga 
            WHERE status = 'ativa'
            ORDER BY acquisition_date DESC, tag_id
        `;
        return this.runQuery(sql);
    }

    async getAllPecasVencidas(): Promise<PecaCarga[]> {
        const sql = `
            SELECT * FROM pecas_carga 
            WHERE status = 'inativa'
            ORDER BY acquisition_date DESC, tag_id
        `;
        return this.runQuery(sql);
    }

    async getPecasSemVinculoAtivo(): Promise<PecaCarga[]> {
        const sql = `
            SELECT pc.* FROM pecas_carga pc
            LEFT JOIN carga_ensaio ce ON pc.id = ce.peca_id AND ce.vinculo_status = 'ativo'
            WHERE pc.status = 'ativa' AND ce.peca_id IS NULL
            ORDER BY pc.acquisition_date DESC, pc.tag_id
        `;
        return this.runQuery(sql);
    }

    async getPecasCycleDistribution(): Promise<Array<{ type: string; range1: number; range2: number; range3: number; range4: number }>> {
        const sql = `SELECT type, cycles FROM pecas_carga WHERE status = 'ativa'`;
        const rows = await this.runQuery(sql);

        const types = ['fronhas', 'toalhas', 'lencol'];
        const dist: Record<string, { range1: number; range2: number; range3: number; range4: number }> = {
            fronhas: { range1: 0, range2: 0, range3: 0, range4: 0 },
            toalhas: { range1: 0, range2: 0, range3: 0, range4: 0 },
            lencol: { range1: 0, range2: 0, range3: 0, range4: 0 }
        };

        for (const r of rows) {
            const t: string = (r.type || '').toLowerCase();
            const normalizedType = t === 'lençol' ? 'lencol' : t;

            if (!types.includes(normalizedType)) continue;
            
            const c = Number(r.cycles) || 0;
            if (c <= 19) dist[normalizedType].range1++;
            else if (c <= 39) dist[normalizedType].range2++;
            else if (c <= 59) dist[normalizedType].range3++;
            else dist[normalizedType].range4++;
        }

        const result = types.map(t => ({ type: t, ...dist[t] }));
        
        return result;
    }

    // ============================================================================
    // OPERAÇÕES DE PROTOCOLO DE CARGA
    // ============================================================================

    async saveProtocoloCarga(protocolo: string, pecas_vinculadas: Array<{ peca_id: number; tipo_ciclo?: string }>): Promise<void> {
        const proto = (protocolo || '').trim();
        if (!proto) throw new Error('Protocolo inválido');
        if (!Array.isArray(pecas_vinculadas) || pecas_vinculadas.length === 0) {
            throw new Error('Nenhuma peça vinculada fornecida');
        }

        await this.runTransaction(async () => {
            for (const vinc of pecas_vinculadas) {
                const pecaId = Number(vinc.peca_id);
                if (!pecaId) {
                    throw new Error('ID de peça inválido');
                }
                const tipo = (vinc.tipo_ciclo ?? '').trim() || null;
                // Buscar ciclos atuais da peça
                const pRows = await this.runQuery('SELECT cycles FROM pecas_carga WHERE id = ? LIMIT 1', [pecaId]);
                if (!pRows || pRows.length === 0) {
                    throw new Error(`Peça não encontrada (id=${pecaId})`);
                }
                const ciclosAtuais = Number(pRows[0].cycles) || 0;
                
                await this.runQuery(
                    `INSERT INTO carga_ensaio (protocolo, peca_id, tipo_ciclo, vinculo_status, ciclos_no_vinculo, created_at)
                     VALUES (?, ?, ?, 'ativo', ?, datetime('now'))`,
                    [proto, pecaId, tipo, ciclosAtuais]
                );
            }
        });
    }

    /**
     * Adiciona peças a um protocolo existente
     */
    async addPecaToProtocolo(protocolo: string, pecas_vinculadas: Array<{ peca_id: number; tipo_ciclo: string }>): Promise<void> {
        const proto = protocolo.trim();
        if (!proto) {
            throw new Error('Nome do protocolo é obrigatório');
        }

        if (!Array.isArray(pecas_vinculadas) || pecas_vinculadas.length === 0) {
            throw new Error('Pelo menos uma peça deve ser selecionada');
        }

        await this.runTransaction(async () => {
            for (const { peca_id, tipo_ciclo } of pecas_vinculadas) {
                const pecaId = Number(peca_id);
                const tipo = tipo_ciclo || 'frio';

                if (isNaN(pecaId)) {
                    throw new Error(`ID da peça inválido: ${peca_id}`);
                }

                // Verificar se a peça existe e está ativa
                const peca = await this.runQuery(
                    'SELECT id, cycles FROM pecas_carga WHERE id = ? AND status = "ativa"',
                    [pecaId]
                );

                if (!peca || peca.length === 0) {
                    throw new Error(`Peça com ID ${pecaId} não encontrada ou não está ativa`);
                }

                const ciclosAtuais = peca[0].cycles || 0;
                
                // Inserir novo vínculo na tabela carga_ensaio
                await this.runQuery(
                    `INSERT INTO carga_ensaio (protocolo, peca_id, tipo_ciclo, vinculo_status, ciclos_no_vinculo, created_at)
                     VALUES (?, ?, ?, 'ativo', ?, datetime('now'))`,
                    [proto, pecaId, tipo, ciclosAtuais]
                );
            }
        });
    }

    async deleteProtocoloCarga(protocolo: string, cycles_to_add: number, tipo_ciclo: string): Promise<{ pecasAfetadas: any[], pecasVencidas: any[] }> {
        const pecasAfetadas: any[] = [];
        const pecasVencidas: any[] = [];

        await this.runTransaction(async () => {
            // Busca TODAS as peças vinculadas ao protocolo (independente do timestamp)
            const pecasVinculadas = await this.runQuery(`
                SELECT DISTINCT ce.peca_id, pc.tag_id, pc.cycles, pc.status, pc.type
                FROM carga_ensaio ce
                JOIN pecas_carga pc ON ce.peca_id = pc.id
                WHERE ce.protocolo = ? AND ce.tipo_ciclo = ? AND ce.vinculo_status = 'ativo'
            `, [protocolo, tipo_ciclo]);

            if (pecasVinculadas.length === 0) {
                return; // Nenhuma peça vinculada encontrada
            }

            for (const peca of pecasVinculadas) {
                const newCycles = peca.cycles + cycles_to_add;
                
                // Atualiza ciclos da peça
                await this.updatePeca(peca.peca_id, { cycles: newCycles });
                
                pecasAfetadas.push({
                    tag_id: peca.tag_id,
                    type: peca.type,
                    cycles: newCycles,
                    cycles_before: peca.cycles,
                    cycles_after: newCycles,
                    cycles_added: cycles_to_add
                });

                // Verifica se a peça deve ser marcada como vencida (>= 80 ciclos)
                if (newCycles >= 80 && peca.status === 'ativa') {
                    await this.updatePeca(peca.peca_id, { status: 'inativa' });
                    pecasVencidas.push({
                        tag_id: peca.tag_id,
                        type: peca.type,
                        cycles: newCycles
                    });
                }
            }

            // Atualiza o status do vínculo para desvinculado para TODAS as entradas do protocolo
            await this.runQuery('UPDATE carga_ensaio SET vinculo_status = "desvinculado" WHERE protocolo = ? AND tipo_ciclo = ? AND vinculo_status = "ativo"', [protocolo, tipo_ciclo]);
        });

        return { pecasAfetadas, pecasVencidas };
    }

    /**
     * Exclui um protocolo do banco de dados de forma simples
     * @param protocolo - Identificador do protocolo a ser excluído
     * @returns Promise<boolean> - true se o protocolo foi excluído com sucesso
     */
    async deleteProtocolo(protocolo: string): Promise<boolean> {
        try {
            await this.runTransaction(async () => {
                // Verifica se o protocolo existe
                const protocoloExists = await this.runQuery(`
                    SELECT COUNT(*) as count
                    FROM carga_ensaio
                    WHERE protocolo = ?
                `, [protocolo]);

                if (protocoloExists[0]?.count === 0) {
                    throw new Error(`Protocolo ${protocolo} não encontrado`);
                }

                // Exclui todas as entradas do protocolo na tabela carga_ensaio
                await this.runQuery(`
                    DELETE FROM carga_ensaio
                    WHERE protocolo = ?
                `, [protocolo]);

                console.log(`✅ Protocolo ${protocolo} excluído com sucesso`);
            });

            return true;
        } catch (error) {
            console.error(`❌ Erro ao excluir protocolo ${protocolo}:`, error);
            throw error;
        }
    }

    async getProtocoloCargaDetails(protocolo: string, tipoCiclo?: string): Promise<any> {
        // Buscar todas as peças vinculadas ao protocolo (ativas e desvinculadas)
        let sql = `
            SELECT ce.*, pc.tag_id, pc.type, pc.cycles, pc.status, pc.acquisition_date
            FROM carga_ensaio ce
            JOIN pecas_carga pc ON ce.peca_id = pc.id
            WHERE ce.protocolo = ?
        `;
        const params = [protocolo];

        if (tipoCiclo) {
            sql += ' AND ce.tipo_ciclo = ?';
            params.push(tipoCiclo);
        }

        sql += ' ORDER BY pc.tag_id';

        const pecas = await this.runQuery(sql, params);
        
        // Encontrar o timestamp mais recente para referência
        let timestampSql = `
            SELECT MAX(created_at) as latest_created_at
            FROM carga_ensaio
            WHERE protocolo = ?
        `;
        const timestampParams = [protocolo];
        
        if (tipoCiclo) {
            timestampSql += ' AND tipo_ciclo = ?';
            timestampParams.push(tipoCiclo);
        }
        
        const timestampResult = await this.runQuery(timestampSql, timestampParams);
        const latestTimestamp = timestampResult[0]?.latest_created_at;
        
        return {
            protocolo,
            tipo_ciclo: tipoCiclo,
            pecas_vinculadas: pecas,
            total_pecas: pecas.length,
            ensaio_timestamp: latestTimestamp
        };
    }

    /**
     * Lista todos os ensaios de um protocolo com informações resumidas
     */
    async getProtocoloEnsaios(protocolo: string): Promise<Array<{ created_at: string; total_pecas: number; tipos_ciclo: string[] }>> {
        const sql = `
            SELECT 
                ce.created_at,
                COUNT(*) as total_pecas,
                GROUP_CONCAT(DISTINCT ce.tipo_ciclo) as tipos_ciclo
            FROM carga_ensaio ce
            WHERE ce.protocolo = ?
            GROUP BY ce.created_at
            ORDER BY ce.created_at DESC
        `;
        
        const ensaios = await this.runQuery(sql, [protocolo]);
        
        return ensaios.map((e: any) => ({
            created_at: e.created_at,
            total_pecas: Number(e.total_pecas) || 0,
            tipos_ciclo: e.tipos_ciclo ? e.tipos_ciclo.split(',').filter((t: string) => t) : []
        }));
    }

    async getAllProtocolosCarga(): Promise<any[]> {
        const rows = await this.runQuery('SELECT DISTINCT protocolo FROM carga_ensaio ORDER BY protocolo');
        return rows.map((r: any) => ({ protocolo: r.protocolo }));
    }

    async getProtocoloCargaPiecesWithCycles(protocolo: string, tipo_ciclo: string): Promise<any[]> {
        // Primeiro, encontrar o timestamp mais recente para este protocolo
        const timestampResult = await this.runQuery(`
            SELECT MAX(created_at) as latest_created_at
            FROM carga_ensaio
            WHERE protocolo = ? AND tipo_ciclo = ?
        `, [protocolo, tipo_ciclo]);
        
        const latestTimestamp = timestampResult[0]?.latest_created_at;
        if (!latestTimestamp) {
            return [];
        }

        const sql = `
            SELECT pc.tag_id, pc.cycles, pc.type, pc.status, ce.vinculo_status
            FROM carga_ensaio ce
            JOIN pecas_carga pc ON ce.peca_id = pc.id
            WHERE ce.protocolo = ? AND ce.tipo_ciclo = ? AND ce.created_at = ?
            ORDER BY pc.tag_id
        `;
        return this.runQuery(sql, [protocolo, tipo_ciclo, latestTimestamp]);
    }

    async getActiveProtocolosCarga(): Promise<any[]> {
        // Primeiro, encontrar o timestamp mais recente para cada protocolo
        const sql = `
            SELECT DISTINCT protocolo,
                   SUM(CASE WHEN tipo_ciclo = 'frio' THEN 1 ELSE 0 END) as ciclo_frio_count,
                   SUM(CASE WHEN tipo_ciclo = 'quente' THEN 1 ELSE 0 END) as ciclo_quente_count,
                   COUNT(*) as total_pecas
            FROM carga_ensaio ce1
            WHERE vinculo_status = 'ativo'
              AND created_at = (
                  SELECT MAX(created_at) 
                  FROM carga_ensaio ce2 
                  WHERE ce2.protocolo = ce1.protocolo
              )
            GROUP BY protocolo
            ORDER BY protocolo
        `;
        return this.runQuery(sql);
    }

    async getProtocolosComStatus(): Promise<any[]> {
        const sql = `
            SELECT 
                protocolo,
                MAX(created_at) as created_at,
                CASE 
                    WHEN SUM(CASE WHEN vinculo_status = 'ativo' THEN 1 ELSE 0 END) > 0 THEN 'ativo'
                    ELSE 'desvinculado'
                END as vinculo_status,
                COUNT(CASE WHEN tipo_ciclo = 'frio' AND vinculo_status = 'ativo' THEN 1 END) as ciclo_frio_count,
                COUNT(CASE WHEN tipo_ciclo = 'quente' AND vinculo_status = 'ativo' THEN 1 END) as ciclo_quente_count,
                COUNT(CASE WHEN vinculo_status = 'ativo' THEN 1 END) as total_pecas,
                CASE 
                    WHEN COUNT(CASE WHEN tipo_ciclo = 'frio' AND vinculo_status = 'ativo' THEN 1 END) > 0 THEN 'Disponível'
                    ELSE 'Não disponível'
                END as ciclo_frio_status,
                CASE 
                    WHEN COUNT(CASE WHEN tipo_ciclo = 'quente' AND vinculo_status = 'ativo' THEN 1 END) > 0 THEN 'Disponível'
                    ELSE 'Não disponível'
                END as ciclo_quente_status,
                datetime(MAX(created_at)) as ensaio_data
            FROM carga_ensaio
            GROUP BY protocolo
            ORDER BY protocolo
        `;
        return this.runQuery(sql);
    }







    // ============================================================================
    // BACKUP
    // ============================================================================

    private async runMigrations(): Promise<void> {
        console.log('Executando migrações do módulo de carga...');
        
        // Tabela cargo_migrations removida - não é mais necessária
        // Apenas as tabelas pecas_carga e carga_ensaio são mantidas

        // Adicionar migrações específicas aqui se necessário
    }

    // ============================================================================
    // MÉTODOS AUXILIARES
    // ============================================================================

    private async runQuery(sql: string, params: any[] = []): Promise<any> {
        if (!this.db) {
            throw new Error('Banco de dados não conectado');
        }

        return new Promise((resolve, reject) => {
            if (sql.trim().toUpperCase().startsWith('SELECT')) {
                this.db!.all(sql, params, (err, rows) => {
                    if (err) {
                        console.error('Erro na query SELECT:', err);
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            } else {
                this.db!.run(sql, params, function(err) {
                    if (err) {
                        console.error('Erro na query:', err);
                        reject(err);
                    } else {
                        resolve({ lastID: this.lastID, changes: this.changes });
                    }
                });
            }
        });
    }

    private async runTransaction(callback: () => Promise<void>): Promise<void> {
        if (!this.db) {
            throw new Error('Banco de dados não conectado');
        }

        await this.runQuery('BEGIN TRANSACTION');
        
        try {
            await callback();
            await this.runQuery('COMMIT');
        } catch (error) {
            await this.runQuery('ROLLBACK');
            throw error;
        }
    }

    // ============================================================================
    // MÉTODOS DE BACKUP
    // ============================================================================

    /**
     * Cria um backup completo do banco de dados de carga
     */
    async createFullBackup(): Promise<string> {
        return await this.backupManager.createFullBackup();
    }

    /**
     * Cria um backup incremental baseado nas mudanças desde o último backup
     */
    async createIncrementalBackup(): Promise<string> {
        return await this.backupManager.createIncrementalBackup();
    }

    /**
     * Lista todos os backups disponíveis
     */
    async listBackups(): Promise<any[]> {
        return await this.backupManager.listBackups();
    }

    /**
     * Obtém estatísticas dos backups
     */
    async getBackupStats(): Promise<any> {
        return await this.backupManager.getBackupStats();
    }

    /**
     * Limpa backups antigos baseado na política de retenção
     */
    async cleanupOldBackups(): Promise<void> {
        await this.backupManager.cleanupOldBackups();
    }

    /**
     * Restaura um backup específico
     */
    async restoreBackup(backupId: string): Promise<void> {
        await this.backupManager.restoreBackup(backupId);
    }

    /**
     * Obtém o gerenciador de backup para operações avançadas
     */
    getBackupManager(): BackupCargoManager {
        return this.backupManager;
    }
}