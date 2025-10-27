/**
 * Arquitetura Híbrida de Banco de Dados
 * 
 * Mantém o módulo principal (inventário, ensaios, calibrações, sistema) no banco atual
 * e separa apenas o módulo de carga em um banco independente.
 */

import * as sqlite3 from 'sqlite3';

// ============================================================================
// INTERFACES COMUNS
// ============================================================================

export interface IModuleDatabase {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    initialize(): Promise<void>;
    close(): Promise<void>;
}

export interface ITransaction {
    begin(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
}

// ============================================================================
// INTERFACES DO MÓDULO DE CARGA
// ============================================================================

export interface PecaCarga {
    id?: number;
    tag_id: string;
    type: string;
    cycles: number;
    status: string; // 'ativa', 'inativa'
    acquisition_date?: string;
}

export interface CargaEnsaio {
    id?: number;
    peca_id: number;
    protocolo: string;
    tipo_ciclo: string; // 'frio', 'quente'
    vinculo_status: string; // 'ativo', 'inativo'
    ciclos_no_vinculo?: number;
}





// ============================================================================
// INTERFACE DO MÓDULO DE CARGA
// ============================================================================

export interface ICargoManager extends IModuleDatabase {
    // Operações de Peças
    addPeca(peca: Omit<PecaCarga, 'id' | 'created_at' | 'updated_at'>): Promise<number>;
    updatePeca(id: number, updates: Partial<PecaCarga>): Promise<void>;
    deletePeca(id: number): Promise<void>;
    getPecaById(id: number): Promise<PecaCarga | null>;
    getPecaByTagId(tagId: string): Promise<PecaCarga | null>;
    getAllPecas(): Promise<PecaCarga[]>;
    getPecasByStatus(status: string): Promise<PecaCarga[]>;
    updatePecaStatus(tagId: string, status: string): Promise<void>;

    // Operações de Carga de Ensaio
    addCargaEnsaio(carga: Omit<CargaEnsaio, 'id' | 'created_at' | 'updated_at'>): Promise<number>;
    updateCargaEnsaio(id: number, updates: Partial<CargaEnsaio>): Promise<void>;
    deleteCargaEnsaio(id: number): Promise<void>;
    getCargaEnsaioById(id: number): Promise<CargaEnsaio | null>;
    getCargasByPeca(pecaId: number): Promise<CargaEnsaio[]>;
    getCargasByStatus(status: string): Promise<CargaEnsaio[]>;

    // Operações de Protocolos
    getProtocolosComStatus(): Promise<any[]>;

    // Operações de Relatórios
    getCargoReport(filters?: any): Promise<any>;
    getPecaDetails(tagId: string): Promise<any>;

    // Operações de Backup
    createBackup(backupPath: string): Promise<void>;
}

// ============================================================================
// INTERFACE DO COORDENADOR HÍBRIDO
// ============================================================================

export interface IHybridCoordinator {
    // Inicialização
    initialize(mainDatabaseManager: any, cargoManager: ICargoManager): Promise<void>;
    close(): Promise<void>;

    // Operações Cross-Module
    linkProtocolToPiece(pecaTagId: string, protocoloNome: string, tipoCiclo: string): Promise<void>;
    updatePieceStatusFromAssay(pecaTagId: string, assayStatus: string): Promise<void>;
    notifyAssayCompletion(assayId: number, pecaTagId: string): Promise<void>;
    
    // Sincronização de Dados
    syncCargoDataToMain(): Promise<any>;
    getUnifiedData(): Promise<any>;
    // Backup Coordenado
    createUnifiedBackup(backupPath: string): Promise<void>;
}

// ============================================================================
// CONFIGURAÇÃO DA ARQUITETURA HÍBRIDA
// ============================================================================

export const HYBRID_CONFIG = {
    // Módulo Principal (banco atual)
    main: {
        database: 'database.sqlite',
        modules: ['inventory', 'assays', 'calibrations', 'system', 'holidays', 'settings'],
        tables: [
            'inventory',
            'scheduled_assays',
            'safety_scheduled_assays', 
            'historical_assays',
            'assay_lots',
            'calibrations',
            'calibration_equipments',
            'efficiency_categories',
            'safety_categories',
            'holidays',
            'settings',
            'system_users',
            'audit_logs'
        ]
    },

    // Módulo de Carga (banco separado)
    cargo: {
        database: 'cargo.sqlite',
        modules: ['cargo'],
        tables: [
            'pecas_carga',
            'carga_ensaio'
        ]
    },

    // Operações Cross-Module
    crossModuleOperations: [
        'linkProtocolToPiece',
        'updatePieceStatusFromAssay',
        'notifyAssayCompletion',
        'syncCargoDataToMain'
    ],

    // Chaves de Relacionamento
    relationships: {
        // Relacionamento entre ensaios (main) e peças (cargo)
        assay_to_piece: {
            main_table: 'scheduled_assays',
            main_field: 'affected_terminals', // pode conter tag_id da peça
            cargo_table: 'pecas_carga',
            cargo_field: 'tag_id'
        }
    }
};

// ============================================================================
// TIPOS DE EVENTOS PARA COMUNICAÇÃO ENTRE MÓDULOS
// ============================================================================

export interface CrossModuleEvent {
    type: 'PIECE_STATUS_CHANGED' | 'ASSAY_COMPLETED' | 'PROTOCOL_LINKED' | 'CARGO_UPDATED';
    source: 'main' | 'cargo';
    target: 'main' | 'cargo';
    data: any;
    timestamp: string;
    user?: string;
}

export interface EventBus {
    emit(event: CrossModuleEvent): Promise<void>;
    on(eventType: string, handler: (event: CrossModuleEvent) => Promise<void>): void;
    off(eventType: string, handler: (event: CrossModuleEvent) => Promise<void>): void;
}