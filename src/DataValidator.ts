import { InventoryItem, Assay, Holiday, Calibration, Settings, SystemUser, EfficiencyCategory } from './DatabaseManager';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    sanitizedData?: any;
}

export interface ValidationRule {
    field: string;
    type: 'string' | 'number' | 'date' | 'email' | 'array' | 'object' | 'boolean';
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: RegExp;
    customValidator?: (value: any, data?: any) => boolean;
    sanitizer?: (value: any) => any;
}

export class DataValidator {
    private static readonly EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    private static readonly DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
    private static readonly PROTOCOL_PATTERN = /^[A-Z0-9\-_]+$/i;

    // Schema para Itens de Inventário
    private static readonly INVENTORY_SCHEMA: ValidationRule[] = [
        {
            field: 'reagent',
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 100,
            sanitizer: (value: string) => value.trim().replace(/\s+/g, ' ')
        },
        {
            field: 'manufacturer',
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 100,
            sanitizer: (value: string) => value.trim().replace(/\s+/g, ' ')
        },
        {
            field: 'lot',
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 50,
            sanitizer: (value: string) => value.trim().toUpperCase()
        },
        {
            field: 'quantity',
            type: 'number',
            required: true,
            min: 0,
            max: 999999,
            sanitizer: (value: any) => Math.max(0, Number(value) || 0)
        },
        {
            field: 'validity',
            type: 'date',
            required: true,
            pattern: DataValidator.DATE_PATTERN,
            customValidator: (value: string) => {
                const date = new Date(value);
                return !isNaN(date.getTime()) && date > new Date('1900-01-01');
            }
        }
    ];

    // Schema para Ensaios
    private static readonly ASSAY_SCHEMA: ValidationRule[] = [
        {
            field: 'protocol',
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 50,
            pattern: DataValidator.PROTOCOL_PATTERN,
            sanitizer: (value: string) => value.trim().toUpperCase()
        },
        {
            field: 'orcamento',
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 50,
            sanitizer: (value: string) => value.trim()
        },
        {
            field: 'assayManufacturer',
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 100,
            sanitizer: (value: string) => value.trim()
        },
        {
            field: 'model',
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 100,
            sanitizer: (value: string) => value.trim()
        },
        {
            field: 'nominalLoad',
            type: 'number',
            required: true,
            min: 0.1,
            max: 50,
            sanitizer: (value: any) => Math.max(0.1, Number(value) || 0.1)
        },
        {
            field: 'tensao',
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 20,
            sanitizer: (value: string) => value.trim()
        },
        {
            field: 'startDate',
            type: 'date',
            required: true,
            pattern: DataValidator.DATE_PATTERN
        },
        {
            field: 'endDate',
            type: 'date',
            required: true,
            pattern: DataValidator.DATE_PATTERN,
            customValidator: (value: string, data: any) => {
                if (!data.startDate) return true;
                return new Date(value) >= new Date(data.startDate);
            }
        },
        {
            field: 'setup',
            type: 'number',
            required: true,
            min: 1,
            max: 20,
            sanitizer: (value: any) => Math.max(1, Math.min(20, Number(value) || 1))
        },
        {
            field: 'status',
            type: 'string',
            required: true,
            customValidator: (value: string) => {
                const validStatuses = ['Agendado', 'Em Andamento', 'Concluído', 'Cancelado', 'Pausado'];
                return validStatuses.includes(value);
            }
        },
        {
            field: 'type',
            type: 'string',
            required: true,
            customValidator: (value: string) => {
                const validTypes = ['Eficiência', 'Segurança', 'Desenvolvimento'];
                return validTypes.includes(value);
            }
        },
        {
            field: 'cycles',
            type: 'number',
            required: true,
            min: 1,
            max: 10000,
            sanitizer: (value: any) => Math.max(1, Number(value) || 1)
        },
        {
            field: 'observacoes',
            type: 'string',
            required: false,
            maxLength: 1000,
            sanitizer: (value: string) => value ? value.trim() : ''
        }
    ];

    // Schema para Feriados
    private static readonly HOLIDAY_SCHEMA: ValidationRule[] = [
        {
            field: 'name',
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 100,
            sanitizer: (value: string) => value.trim()
        },
        {
            field: 'startDate',
            type: 'date',
            required: true,
            pattern: DataValidator.DATE_PATTERN
        },
        {
            field: 'endDate',
            type: 'date',
            required: true,
            pattern: DataValidator.DATE_PATTERN,
            customValidator: (value: string, data: any) => {
                if (!data.startDate) return true;
                return new Date(value) >= new Date(data.startDate);
            }
        }
    ];

    // Schema para Calibrações
    private static readonly CALIBRATION_SCHEMA: ValidationRule[] = [
        {
            field: 'protocol',
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 50,
            pattern: DataValidator.PROTOCOL_PATTERN,
            sanitizer: (value: string) => value.trim().toUpperCase()
        },
        {
            field: 'startDate',
            type: 'date',
            required: true,
            pattern: DataValidator.DATE_PATTERN
        },
        {
            field: 'endDate',
            type: 'date',
            required: true,
            pattern: DataValidator.DATE_PATTERN,
            customValidator: (value: string, data: any) => {
                if (!data.startDate) return true;
                return new Date(value) >= new Date(data.startDate);
            }
        },
        {
            field: 'type',
            type: 'string',
            required: true,
            customValidator: (value: string) => {
                const validTypes = ['Preventiva', 'Corretiva', 'Verificação'];
                return validTypes.includes(value);
            }
        },
        {
            field: 'status',
            type: 'string',
            required: true,
            customValidator: (value: string) => {
                const validStatuses = ['Agendada', 'Em Andamento', 'Concluída', 'Cancelada'];
                return validStatuses.includes(value);
            }
        },
        {
            field: 'affectedTerminals',
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 200,
            sanitizer: (value: string) => value.trim()
        }
    ];

    // Schema para Configurações
    private static readonly SETTINGS_SCHEMA: ValidationRule[] = [
        {
            field: 'notificationEmail',
            type: 'email',
            required: true,
            pattern: DataValidator.EMAIL_PATTERN,
            sanitizer: (value: string) => value.trim().toLowerCase()
        },
        {
            field: 'alertThreshold',
            type: 'number',
            required: true,
            min: 1,
            max: 365,
            sanitizer: (value: any) => Math.max(1, Math.min(365, Number(value) || 30))
        },
        {
            field: 'schedulePassword',
            type: 'string',
            required: false,
            minLength: 4,
            maxLength: 50,
            sanitizer: (value: string) => value ? value.trim() : undefined
        }
    ];

    // Schema para Usuários do Sistema
    private static readonly USER_SCHEMA: ValidationRule[] = [
        {
            field: 'username',
            type: 'string',
            required: true,
            minLength: 3,
            maxLength: 50,
            pattern: /^[a-zA-Z0-9_.-]+$/,
            sanitizer: (value: string) => value.trim().toLowerCase()
        },
        {
            field: 'type',
            type: 'string',
            required: true,
            customValidator: (value: string) => {
                const validTypes = ['administrador', 'tecnico_eficiencia', 'tecnico_seguranca', 'visualizador'];
                return validTypes.includes(value);
            }
        },
        {
            field: 'displayName',
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 100,
            sanitizer: (value: string) => value.trim()
        }
    ];

    // Schema para Categorias de Eficiência
    private static readonly CATEGORY_SCHEMA: ValidationRule[] = [
        {
            field: 'name',
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 100,
            sanitizer: (value: string) => value.trim()
        }
    ];



    /**
     * Valida dados de inventário
     */
    public static validateInventoryItem(data: any): ValidationResult {
        return this.validateData(data, this.INVENTORY_SCHEMA);
    }

    /**
     * Valida dados de ensaio
     */
    public static validateAssay(data: any): ValidationResult {
        return this.validateData(data, this.ASSAY_SCHEMA);
    }

    /**
     * Valida dados de feriado
     */
    public static validateHoliday(data: any): ValidationResult {
        return this.validateData(data, this.HOLIDAY_SCHEMA);
    }

    /**
     * Valida dados de calibração
     */
    public static validateCalibration(data: any): ValidationResult {
        return this.validateData(data, this.CALIBRATION_SCHEMA);
    }

    /**
     * Valida configurações
     */
    public static validateSettings(data: any): ValidationResult {
        return this.validateData(data, this.SETTINGS_SCHEMA);
    }

    /**
     * Valida usuário do sistema
     */
    public static validateUser(data: any): ValidationResult {
        return this.validateData(data, this.USER_SCHEMA);
    }

    /**
     * Valida categoria
     */
    public static validateCategory(data: any): ValidationResult {
        return this.validateData(data, this.CATEGORY_SCHEMA);
    }



    /**
     * Método principal de validação
     */
    private static validateData(data: any, schema: ValidationRule[]): ValidationResult {
        const errors: string[] = [];
        const sanitizedData: any = { ...data };

        if (!data || typeof data !== 'object') {
            return {
                isValid: false,
                errors: ['Dados inválidos: objeto esperado']
            };
        }

        for (const rule of schema) {
            const value = data[rule.field];
            
            // Verificar se campo obrigatório está presente
            if (rule.required && (value === undefined || value === null || value === '')) {
                errors.push(`Campo '${rule.field}' é obrigatório`);
                continue;
            }

            // Se campo não é obrigatório e está vazio, pular validação
            if (!rule.required && (value === undefined || value === null || value === '')) {
                continue;
            }

            // Sanitizar dados
            if (rule.sanitizer && value !== undefined && value !== null) {
                sanitizedData[rule.field] = rule.sanitizer(value);
            }

            // Validar tipo
            if (!this.validateType(value, rule.type)) {
                errors.push(`Campo '${rule.field}' deve ser do tipo ${rule.type}`);
                continue;
            }

            // Validar comprimento mínimo
            if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
                errors.push(`Campo '${rule.field}' deve ter pelo menos ${rule.minLength} caracteres`);
            }

            // Validar comprimento máximo
            if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
                errors.push(`Campo '${rule.field}' deve ter no máximo ${rule.maxLength} caracteres`);
            }

            // Validar valor mínimo
            if (rule.min !== undefined && typeof value === 'number' && value < rule.min) {
                errors.push(`Campo '${rule.field}' deve ser maior ou igual a ${rule.min}`);
            }

            // Validar valor máximo
            if (rule.max !== undefined && typeof value === 'number' && value > rule.max) {
                errors.push(`Campo '${rule.field}' deve ser menor ou igual a ${rule.max}`);
            }

            // Validar padrão regex
            if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
                errors.push(`Campo '${rule.field}' não atende ao formato esperado`);
            }

            // Validador customizado
            if (rule.customValidator && !rule.customValidator(value, data)) {
                errors.push(`Campo '${rule.field}' contém valor inválido`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedData: errors.length === 0 ? sanitizedData : undefined
        };
    }

    /**
     * Valida tipo de dados
     */
    private static validateType(value: any, type: string): boolean {
        switch (type) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'date':
                return typeof value === 'string' && !isNaN(Date.parse(value));
            case 'email':
                return typeof value === 'string' && this.EMAIL_PATTERN.test(value);
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            default:
                return true;
        }
    }

    /**
     * Sanitiza string removendo caracteres perigosos
     */
    public static sanitizeString(input: string): string {
        if (typeof input !== 'string') return '';
        
        return input
            .trim()
            .replace(/[<>]/g, '') // Remove < e >
            .replace(/javascript:/gi, '') // Remove javascript:
            .replace(/on\w+=/gi, '') // Remove event handlers
            .replace(/\0/g, '') // Remove null bytes
            .substring(0, 1000); // Limita tamanho
    }

    /**
     * Sanitiza número
     */
    public static sanitizeNumber(input: any, min?: number, max?: number): number {
        const num = Number(input);
        if (isNaN(num)) return 0;
        
        let result = num;
        if (min !== undefined) result = Math.max(min, result);
        if (max !== undefined) result = Math.min(max, result);
        
        return result;
    }

    /**
     * Valida e sanitiza data
     */
    public static sanitizeDate(input: string): string | null {
        if (typeof input !== 'string') return null;
        
        const date = new Date(input);
        if (isNaN(date.getTime())) return null;
        
        // Retorna no formato YYYY-MM-DD
        return date.toISOString().split('T')[0];
    }
}