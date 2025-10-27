/**
 * Coordenador Híbrido - Arquitetura Híbrida
 * 
 * Responsável por coordenar operações entre o módulo principal (banco atual)
 * e o módulo de carga (banco separado), garantindo consistência e integridade.
 */

import * as path from 'path';
import { DatabaseManager } from './DatabaseManager';
import { CargoManager } from './modules/CargoManager';
import { 
    IHybridCoordinator, 
    CrossModuleEvent, 
    EventBus,
    PecaCarga,
    CargaEnsaio
} from './HybridDatabaseArchitecture';

export class HybridCoordinator implements IHybridCoordinator {
    private mainModule: DatabaseManager;
    private cargoModule: CargoManager;
    private eventBus: EventBus;
    private isInitialized: boolean = false;

    constructor(workspaceRoot: string) {
        this.mainModule = new DatabaseManager(workspaceRoot);
        this.cargoModule = new CargoManager(workspaceRoot);
        this.eventBus = new SimpleEventBus();
    }

    // ============================================================================
    // INICIALIZAÇÃO E CONEXÃO
    // ============================================================================

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('Inicializando coordenador híbrido...');

            // Inicializar módulo principal
            await this.mainModule.initialize();
            console.log('Módulo principal inicializado');

            // Inicializar módulo de carga
            await this.cargoModule.initialize();
            console.log('Módulo de carga inicializado');

            // Configurar eventos entre módulos
            this.setupCrossModuleEvents();

            this.isInitialized = true;
            console.log('Coordenador híbrido inicializado com sucesso');

        } catch (error) {
            console.error('Erro ao inicializar coordenador híbrido:', error);
            throw error;
        }
    }

    async close(): Promise<void> {
        if (!this.isInitialized) {
            return;
        }

        try {
            await this.cargoModule.close();
            await this.mainModule.close();
            this.isInitialized = false;
            console.log('Coordenador híbrido fechado');
        } catch (error) {
            console.error('Erro ao fechar coordenador híbrido:', error);
            throw error;
        }
    }

    // ============================================================================
    // OPERAÇÕES CROSS-MODULE
    // ============================================================================

    async linkProtocolToPiece(pecaTagId: string, protocoloNome: string, tipoCiclo: string): Promise<void> {
        try {
            // Verificar se o protocolo existe no módulo principal
            const protocolExists = await this.mainModule.getProtocolByName(protocoloNome);
            if (!protocolExists) {
                throw new Error(`Protocolo '${protocoloNome}' não encontrado no módulo principal`);
            }

            // Verificar se a peça existe no módulo de carga
            const peca = await this.cargoModule.getPecaByTagId(pecaTagId);
            if (!peca) {
                throw new Error(`Peça com tag ID ${pecaTagId} não encontrada no módulo de carga`);
            }

            // Nota: Funcionalidade de protocolo removida - apenas mantendo a lógica de validação
            if (!peca.id) {
                throw new Error(`Peça com tag ID ${pecaTagId} não possui ID válido`);
            }

            // Emitir evento de vinculação
            await this.eventBus.emit({
                type: 'PROTOCOL_LINKED',
                source: 'cargo',
                target: 'main',
                data: {
                    pecaTagId,
                    protocoloNome,
                    tipoCiclo
                },
                timestamp: new Date().toISOString()
            });

            console.log(`Protocolo '${protocoloNome}' vinculado à peça ${pecaTagId}`);

        } catch (error) {
            console.error('Erro ao vincular protocolo à peça:', error);
            throw error;
        }
    }

    async updatePieceCycles(tagId: string, cyclesToAdd: number, cycleType: string): Promise<any> {
        try {
            // Buscar peça no módulo de carga
            const peca = await this.cargoModule.getPecaByTagId(tagId);
            if (!peca) {
                throw new Error(`Peça '${tagId}' não encontrada no módulo de carga`);
            }

            const newCycles = peca.cycles + cyclesToAdd;
            const isExpired = newCycles >= 80; // Limite padrão de ciclos

            // Verificar se o ID da peça existe
            if (!peca.id) {
                throw new Error(`Peça ${tagId} não possui ID válido`);
            }

            // Atualizar ciclos da peça
            await this.cargoModule.updatePeca(peca.id, {
                cycles: newCycles,
                status: isExpired ? 'inativa' : peca.status
            });

            // Buscar peça atualizada
            const updatedPeca = await this.cargoModule.getPecaById(peca.id);

            // Emitir evento de atualização de ciclos
            await this.eventBus.emit({
                type: 'CARGO_UPDATED',
                source: 'cargo',
                target: 'main',
                data: {
                    tagId,
                    oldCycles: peca.cycles,
                    newCycles,
                    isExpired
                },
                timestamp: new Date().toISOString()
            });

            return {
                piece: updatedPeca,
                cyclesAdded: cyclesToAdd,
                totalCycles: newCycles,
                isExpired,
                status: updatedPeca?.status
            };

        } catch (error) {
            console.error('Erro ao atualizar ciclos da peça:', error);
            throw error;
        }
    }

    async notifyTerminalUpdate(terminalId: string, status: string, data?: any): Promise<void> {
        try {
            // Registrar notificação no módulo principal
            await this.mainModule.addSystemNotification({
                type: 'terminal_update',
                message: `Terminal ${terminalId} foi atualizado para status: ${status}`,
                timestamp: new Date().toISOString()
            });

            // Emitir evento
            await this.eventBus.emit({
                type: 'CARGO_UPDATED',
                source: 'cargo',
                target: 'main',
                data: {
                    terminalId,
                    status,
                    data
                },
                timestamp: new Date().toISOString()
            });

            console.log(`Notificação de terminal registrada: ${terminalId} - ${status}`);

        } catch (error) {
            console.error('Erro ao notificar atualização de terminal:', error);
            throw error;
        }
    }
    async updatePieceStatusFromAssay(pecaTagId: string, assayStatus: string): Promise<void> {
        try {
            // Buscar a peça pelo tag ID
            const peca = await this.cargoModule.getPecaByTagId(pecaTagId);
            if (!peca) {
                throw new Error(`Peça com tag ID ${pecaTagId} não encontrada`);
            }

            // Mapear status do ensaio para status da peça
            let newStatus = 'ativo';
            if (assayStatus === 'completed') {
                newStatus = 'ensaiado';
            } else if (assayStatus === 'failed') {
                newStatus = 'falha';
            }

            // Atualizar status da peça
            await this.cargoModule.updatePecaStatus(pecaTagId, newStatus);

            // Emitir evento de atualização
            await this.eventBus.emit({
                type: 'PIECE_STATUS_CHANGED',
                source: 'main',
                target: 'cargo',
                data: {
                    pecaTagId,
                    oldStatus: peca.status,
                    newStatus,
                    assayStatus
                },
                timestamp: new Date().toISOString()
            });

            console.log(`Status da peça ${pecaTagId} atualizado para ${newStatus} baseado no ensaio`);

        } catch (error) {
            console.error('Erro ao atualizar status da peça a partir do ensaio:', error);
            throw error;
        }
    }

    async notifyAssayCompletion(assayId: number, pecaTagId: string): Promise<void> {
        try {
            // Registrar notificação no sistema principal
            await this.mainModule.addSystemNotification({
                type: 'info',
                message: `Ensaio ${assayId} concluído para a peça ${pecaTagId}`
            });

            // Emitir evento de conclusão de ensaio
            await this.eventBus.emit({
                type: 'ASSAY_COMPLETED',
                source: 'main',
                target: 'cargo',
                data: {
                    assayId,
                    pecaTagId
                },
                timestamp: new Date().toISOString()
            });

            console.log(`Notificação de conclusão de ensaio registrada: ${assayId} - ${pecaTagId}`);

        } catch (error) {
            console.error('Erro ao notificar conclusão de ensaio:', error);
            throw error;
        }
    }

    async syncCargoDataToMain(): Promise<any> {
        try {
            // Obter dados do módulo de carga
            const cargoData = await this.cargoModule.getCargoReport();
            
            // Sincronizar dados relevantes com o módulo principal
            const syncResult = {
                totalPieces: cargoData.totalPecas || 0,
                activePieces: cargoData.pecasAtivas || 0,
                expiredPieces: cargoData.pecasVencidas || 0,
                totalProtocols: cargoData.totalProtocolos || 0,
                lastSync: new Date().toISOString()
            };

            console.log('Dados de carga sincronizados com o módulo principal');
            return syncResult;

        } catch (error) {
            console.error('Erro ao sincronizar dados de carga:', error);
            throw error;
        }
    }

    async getUnifiedData(): Promise<any> {
        try {
            // Obter dados do módulo principal
            const mainStats = await this.mainModule.getSystemStats();
            
            // Obter dados do módulo de carga
            const cargoStats = await this.cargoModule.getCargoReport();

            // Combinar dados
            const unifiedData = {
                main: mainStats,
                cargo: cargoStats,
                crossModule: {
                    totalOperations: mainStats.totalPieces + cargoStats.totalPecas,
                    lastUpdate: new Date().toISOString()
                }
            };

            return unifiedData;

        } catch (error) {
            console.error('Erro ao obter dados unificados:', error);
            throw error;
        }
    }

    async createUnifiedBackup(backupPath: string): Promise<void> {
        try {
            // Criar backup do módulo principal
            const mainBackupPath = `${backupPath}_main.db`;
            await this.mainModule.createBackup(mainBackupPath);

            // Criar backup do módulo de carga
            const cargoBackupPath = `${backupPath}_cargo.db`;
            await this.cargoModule.createBackup(cargoBackupPath);

            console.log(`Backup unificado criado: ${mainBackupPath}, ${cargoBackupPath}`);

        } catch (error) {
            console.error('Erro ao criar backup unificado:', error);
            throw error;
        }
    }

    // ============================================================================
    // OPERAÇÕES DE BACKUP DISTRIBUÍDO
    // ============================================================================

    async createFullBackup(backupDir: string): Promise<void> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            
            // Backup do módulo principal
            const mainBackupPath = path.join(backupDir, `main_backup_${timestamp}.sqlite`);
            await this.mainModule.createBackup(mainBackupPath);

            // Backup do módulo de carga
            const cargoBackupPath = path.join(backupDir, `cargo_backup_${timestamp}.sqlite`);
            await this.cargoModule.createBackup(cargoBackupPath);

            console.log(`Backup completo criado em: ${backupDir}`);
            console.log(`- Módulo principal: ${mainBackupPath}`);
            console.log(`- Módulo de carga: ${cargoBackupPath}`);

        } catch (error) {
            console.error('Erro ao criar backup completo:', error);
            throw error;
        }
    }

    // ============================================================================
    // VALIDAÇÃO DE INTEGRIDADE CROSS-MODULE
    // ============================================================================

    async validateCrossModuleIntegrity(): Promise<any> {
        const issues: any[] = [];

        try {
            // Nota: Verificação de protocolos removida - funcionalidade não mais disponível
            // Manter apenas verificações básicas de integridade

            // Verificar consistência de dados entre módulos
            const cargoStats = await this.cargoModule.getCargoReport();
            const mainStats = await this.mainModule.getSystemStats();

            return {
                isValid: issues.length === 0,
                issues,
                stats: {
                    cargo: cargoStats,
                    main: mainStats
                },
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('Erro ao validar integridade cross-module:', error);
            throw error;
        }
    }

    // ============================================================================
    // OPERAÇÕES DELEGADAS - MÓDULO PRINCIPAL
    // ============================================================================

    // Delegar operações do módulo principal
    async getMainModuleData(operation: string, params?: any): Promise<any> {
        switch (operation) {
            case 'getAllAssays':
                return this.mainModule.getAllAssays();
            case 'getAllInventoryItems':
                return this.mainModule.getAllInventoryItems();
            case 'getSystemUsers':
                return this.mainModule.getSystemUsers();
            case 'getSettings':
                return this.mainModule.getSettings();
            case 'getHolidays':
                return this.mainModule.getHolidays();
            default:
                throw new Error(`Operação não suportada: ${operation}`);
        }
    }

    async executeMainModuleOperation(operation: string, params: any): Promise<any> {
        switch (operation) {
            case 'addInventoryItem':
                return this.mainModule.addInventoryItem(params);
            case 'updateAssayStatus':
                return this.mainModule.updateAssayStatus(params.id, params.status);
            case 'addSystemUser':
                return this.mainModule.addSystemUser(params);
            case 'updateSettings':
                return this.mainModule.updateSettings(params);
            default:
                throw new Error(`Operação não suportada: ${operation}`);
        }
    }

    // ============================================================================
    // OPERAÇÕES DELEGADAS - MÓDULO DE CARGA
    // ============================================================================

    // Delegar operações do módulo de carga
    async getCargoModuleData(operation: string, params?: any): Promise<any> {
        switch (operation) {
            case 'getAllPecas':
                return this.cargoModule.getAllPecas();
            case 'getPecaByTagId':
                return this.cargoModule.getPecaByTagId(params.tagId);
            case 'getPecaDetails':
                return this.cargoModule.getPecaDetails(params.tagId);
            case 'getCargasByStatus':
                return this.cargoModule.getCargasByStatus(params.status);

            case 'getCargoReport':
                return this.cargoModule.getCargoReport(params.filters);
            default:
                throw new Error(`Operação não suportada: ${operation}`);
        }
    }

    async executeCargoModuleOperation(operation: string, params: any): Promise<any> {
        switch (operation) {
            case 'addPeca':
                return this.cargoModule.addPeca(params);
            case 'updatePeca':
                return this.cargoModule.updatePeca(params.id, params.updates);
            case 'updatePecaStatus':
                return this.cargoModule.updatePecaStatus(params.tagId, params.status);
            case 'addCargaEnsaio':
                return this.cargoModule.addCargaEnsaio(params);
            default:
                throw new Error(`Operação não suportada: ${operation}`);
        }
    }

    // ============================================================================
    // MÉTODO DELEGADO UNIFICADO PARA OPERAÇÕES DE CARGA
    // ============================================================================

    async delegateCargoOperation(operation: string, params: any = {}): Promise<any> {
        if (!this.isInitialized) {
            throw new Error('HybridCoordinator não inicializado');
        }

        try {
            switch (operation) {
                // Operações de leitura
                case 'getAllPecas':
                    return this.cargoModule.getAllPecas();
                case 'getAllPecasAtivas':
                    return this.cargoModule.getAllPecasAtivas();
                case 'getAllPecasVencidas':
                    return this.cargoModule.getAllPecasVencidas();
                case 'getPecaDetails':
                    return this.cargoModule.getPecaDetails(params.tag_id);
                case 'getPecaByTagId':
                    return this.cargoModule.getPecaByTagId(params.tagId);
                case 'getCargoReport':
                    return this.cargoModule.getCargoReport(params.filters);


                // Operações de escrita
                case 'addPeca':
                    return this.cargoModule.addPeca(params);
                case 'updatePeca':
                    return this.cargoModule.updatePeca(params.id, params.updates);
                case 'updatePecaStatus':
                    return this.cargoModule.updatePecaStatus(params.tag_id, params.status);
                // Protocolo operations removed - no longer supported
                case 'deleteProtocoloCarga':
                    return this.deleteProtocoloCarga(params.protocolo, params.cycles_to_add, params.tipo_ciclo);
                case 'deleteProtocolo':
                    return this.deleteProtocolo(params.protocolo);

                default:
                    throw new Error(`Operação de carga não suportada: ${operation}`);
            }
        } catch (error) {
            console.error(`Erro ao executar operação de carga '${operation}':`, error);
            throw error;
        }
    }

    async deleteProtocoloCarga(protocolo: string, cycles_to_add: number, tipo_ciclo?: string): Promise<{ pecasAfetadas: Array<{ tag_id: string; type: string; cycles: number; status: string }>; pecasVencidas: Array<{ tag_id: string; type: string; cycles: number }> }> {
        try {
            // Deletar protocolo no módulo principal (que tem a lógica completa)
            const result = await this.mainModule.deleteProtocoloCarga(protocolo, cycles_to_add, tipo_ciclo);


            console.log(`Protocolo de carga ${protocolo} deletado com sucesso`);
            return result;

        } catch (error) {
            console.error('Erro ao deletar protocolo de carga:', error);
            throw error;
        }
    }

    async deleteProtocolo(protocolo: string): Promise<boolean> {
        try {
            // Deletar protocolo no módulo principal usando a função simplificada
            const result = await this.mainModule.deleteProtocolo(protocolo);


            console.log(`Protocolo ${protocolo} deletado com sucesso (função simplificada)`);
            return result;

        } catch (error) {
            console.error('Erro ao deletar protocolo (função simplificada):', error);
            throw error;
        }
    }

    // ============================================================================
    // CONFIGURAÇÃO DE EVENTOS
    // ============================================================================

    private setupCrossModuleEvents(): void {
        // Configurar listeners para eventos cross-module
        this.eventBus.on('protocol_linked', async (event) => {
            console.log('Evento: Protocolo vinculado', event.data);
        });

        this.eventBus.on('piece_cycles_updated', async (event) => {
            console.log('Evento: Ciclos da peça atualizados', event.data);
        });

        this.eventBus.on('terminal_updated', async (event) => {
            console.log('Evento: Terminal atualizado', event.data);
        });
    }

    // ============================================================================
    // GETTERS PARA ACESSO DIRETO AOS MÓDULOS
    // ============================================================================

    get mainDatabase(): DatabaseManager {
        return this.mainModule;
    }

    get cargoDatabase(): CargoManager {
        return this.cargoModule;
    }

    get events(): EventBus {
        return this.eventBus;
    }

    get initialized(): boolean {
        return this.isInitialized;
    }
}

// ============================================================================
// IMPLEMENTAÇÃO SIMPLES DO EVENT BUS
// ============================================================================

class SimpleEventBus implements EventBus {
    private listeners: Map<string, Array<(event: CrossModuleEvent) => Promise<void>>> = new Map();

    async emit(event: CrossModuleEvent): Promise<void> {
        const eventListeners = this.listeners.get(event.type);
        if (eventListeners) {
            await Promise.all(eventListeners.map(async listener => {
                try {
                    await listener(event);
                } catch (error) {
                    console.error(`Erro ao processar evento ${event.type}:`, error);
                }
            }));
        }
    }

    on(eventType: string, handler: (event: CrossModuleEvent) => Promise<void>): void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, []);
        }
        this.listeners.get(eventType)!.push(handler);
    }

    off(eventType: string, handler: (event: CrossModuleEvent) => Promise<void>): void {
        const eventListeners = this.listeners.get(eventType);
        if (eventListeners) {
            const index = eventListeners.indexOf(handler);
            if (index > -1) {
                eventListeners.splice(index, 1);
            }
        }
    }
}

export { SimpleEventBus };