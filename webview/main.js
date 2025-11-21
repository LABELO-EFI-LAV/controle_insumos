// -----------------------------------------------------------------------------
// 1. Configuração e Inicialização
// -----------------------------------------------------------------------------

// Aplicação iniciada
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('labcontrol-theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', initialTheme === 'dark');
  const toggleBtn = document.getElementById('theme-toggle');
  const setIcon = () => { if (!toggleBtn) return; toggleBtn.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙'; };
  setIcon();
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('labcontrol-theme', isDark ? 'dark' : 'light');
      setIcon();
      if (renderers && typeof renderers.renderDashboard === 'function') renderers.renderDashboard();
      if (renderers && typeof renderers.renderGanttChart === 'function') renderers.renderGanttChart();
    });
  }
});

/**
 * Função segura para obter chaves de objetos
 * @param {any} obj - Objeto para extrair chaves
 * @returns {string[]} Array de chaves ou array vazio se obj for null/undefined
 */
function safeObjectKeys(obj) {
    if (!obj || typeof obj !== 'object') {
        console.warn('⚠️ Objeto inválido para safeObjectKeys:', obj);
        return [];
    }
    return Object.keys(obj);
}

// --- SISTEMA DE VALIDAÇÃO ROBUSTA ---
/**
 * Sistema de validação de dados com mensagens de erro específicas
 */
const validator = {
    /**
     * Regras de validação para diferentes tipos de campos
     */
    rules: {
        required: (value, fieldName) => {
            if (!value || value.toString().trim() === '') {
                return `${fieldName} é obrigatório.`;
            }
            return null;
        },
        
        email: (value, fieldName) => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (value && !emailRegex.test(value)) {
                return `${fieldName} deve ter um formato válido (exemplo@dominio.com).`;
            }
            return null;
        },
        
        number: (value, fieldName, min = null, max = null) => {
            const num = parseFloat(value);
            if (isNaN(num)) {
                return `${fieldName} deve ser um número válido.`;
            }
            if (min !== null && num < min) {
                return `${fieldName} deve ser maior ou igual a ${min}.`;
            }
            if (max !== null && num > max) {
                return `${fieldName} deve ser menor ou igual a ${max}.`;
            }
            return null;
        },
        
        integer: (value, fieldName, min = null, max = null) => {
            const num = parseInt(value);
            if (isNaN(num) || !Number.isInteger(parseFloat(value))) {
                return `${fieldName} deve ser um número inteiro.`;
            }
            if (min !== null && num < min) {
                return `${fieldName} deve ser maior ou igual a ${min}.`;
            }
            if (max !== null && num > max) {
                return `${fieldName} deve ser menor ou igual a ${max}.`;
            }
            return null;
        },
        
        date: (value, fieldName) => {
            if (value && isNaN(Date.parse(value))) {
                return `${fieldName} deve ter um formato de data válido.`;
            }
            return null;
        },
        
        dateRange: (startDate, endDate, startFieldName, endFieldName) => {
            if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                if (end < start) {
                    return `${endFieldName} não pode ser anterior a ${startFieldName}.`;
                }
            }
            return null;
        },
        
        minLength: (value, fieldName, minLength) => {
            if (value && value.length < minLength) {
                return `${fieldName} deve ter pelo menos ${minLength} caracteres.`;
            }
            return null;
        },
        
        maxLength: (value, fieldName, maxLength) => {
            if (value && value.length > maxLength) {
                return `${fieldName} deve ter no máximo ${maxLength} caracteres.`;
            }
            return null;
        },
        
        unique: (value, fieldName, existingValues, currentId = null) => {
            if (value && existingValues.some(item => 
                item.id !== currentId && 
                item.toString().toLowerCase() === value.toString().toLowerCase()
            )) {
                return `${fieldName} já existe. Escolha um valor diferente.`;
            }
            return null;
        },
        
        futureDate: (value, fieldName) => {
            if (value) {
                const inputDate = new Date(value);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (inputDate < today) {
                    return `${fieldName} deve ser uma data futura.`;
                }
            }
            return null;
        },
        
        validityDate: (value, fieldName) => {
            if (value) {
                const inputDate = new Date(value);
                const today = new Date();
                const oneYearFromNow = new Date();
                oneYearFromNow.setFullYear(today.getFullYear() + 5);
                
                if (inputDate < today) {
                    return `${fieldName} não pode ser uma data passada.`;
                }
                if (inputDate > oneYearFromNow) {
                    return `${fieldName} parece muito distante. Verifique se a data está correta.`;
                }
            }
            return null;
        }
    },
    
    /**
     * Valida um formulário completo
     */
    validateForm: (formData, validationSchema) => {
        const errors = [];
        
        for (const field in validationSchema) {
            const fieldRules = validationSchema[field];
            const fieldValue = formData[field];
            const fieldLabel = fieldRules.label || field;
            
            for (const rule of fieldRules.rules) {
                let error = null;
                
                if (typeof rule === 'string') {
                    // Regra simples
                    error = validator.rules[rule](fieldValue, fieldLabel);
                } else if (typeof rule === 'object') {
                    // Regra com parâmetros
                    const ruleName = rule.type;
                    const params = rule.params || [];
                    error = validator.rules[ruleName](fieldValue, fieldLabel, ...params);
                }
                
                if (error) {
                    errors.push({ field, message: error });
                    break; // Para na primeira regra que falhar para este campo
                }
            }
        }
        
        return errors;
    },
    
    /**
     * Exibe erros de validação na interface
     */
    displayErrors: (errors, formElement = null) => {
        // Remove erros anteriores
        document.querySelectorAll('.validation-error').forEach(el => el.remove());
        document.querySelectorAll('.border-red-500').forEach(el => {
            el.classList.remove('border-red-500');
            el.classList.add('border-gray-300');
        });
        
        if (errors.length === 0) return;
        
        // Exibe novos erros
        errors.forEach(error => {
            const fieldElement = formElement ? 
                formElement.querySelector(`[name="${error.field}"]`) : 
                document.querySelector(`[name="${error.field}"]`);
                
            if (fieldElement) {
                // Destaca o campo com erro
                fieldElement.classList.remove('border-gray-300');
                fieldElement.classList.add('border-red-500');
                
                // Adiciona mensagem de erro
                const errorDiv = document.createElement('div');
                errorDiv.className = 'validation-error text-red-500 text-sm mt-1';
                errorDiv.textContent = error.message;
                
                // Insere a mensagem após o campo
                fieldElement.parentNode.insertBefore(errorDiv, fieldElement.nextSibling);
            }
        });
        
        // Mostra toast com resumo dos erros
        const errorCount = errors.length;
        const message = errorCount === 1 ? 
            'Corrija o erro no formulário.' : 
            `Corrija os ${errorCount} erros no formulário.`;
        utils.showToast(message, true);
        
        // Foca no primeiro campo com erro
        const firstErrorField = document.querySelector('.border-red-500');
        if (firstErrorField) {
            firstErrorField.focus();
            firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },
    
    /**
     * Valida dados de inventário
     */
    validateInventoryItem: (data, existingItems = [], currentId = null) => {
        const schema = {
            reagent: {
                label: 'Reagente',
                rules: ['required']
            },
            manufacturer: {
                label: 'Fabricante',
                rules: ['required', { type: 'minLength', params: [2] }]
            },
            lot: {
                label: 'Lote',
                rules: [
                    'required',
                    { type: 'minLength', params: [2] },
                    { type: 'unique', params: [existingItems.map(item => `${item.reagent}-${item.manufacturer}-${item.lot}`), currentId] }
                ]
            },
            quantity: {
                label: 'Quantidade',
                rules: [{ type: 'integer', params: [1, 999999] }]
            },
            validity: {
                label: 'Data de Validade',
                rules: ['required', 'date', 'validityDate']
            }
        };
        
        return validator.validateForm(data, schema);
    },
    
    /**
     * Valida dados de ensaio
     */
    validateAssayData: (data) => {
        const schema = {
            assayName: {
                label: 'Ensaio',
                rules: ['required', { type: 'minLength', params: [3] }]
            },
            assayManufacturer: {
                label: 'Fabricante',
                rules: ['required']
            },
            nominalLoad: {
                label: 'Carga Nominal',
                rules: [{ type: 'number', params: [0.1, 30] }]
            },
            cycles: {
                label: 'Ciclos',
                rules: [{ type: 'integer', params: [1, 12] }]
            },
            startDate: {
                label: 'Data de Início',
                rules: ['required', 'date']
            },
            endDate: {
                label: 'Data de Fim',
                rules: ['required', 'date']
            }
        };
        
        const errors = validator.validateForm(data, schema);
        
        // Validação adicional para range de datas
        const dateRangeError = validator.rules.dateRange(
            data.startDate, data.endDate, 'Data de Início', 'Data de Fim'
        );
        if (dateRangeError) {
            errors.push({ field: 'endDate', message: dateRangeError });
        }
        
        return errors;
    },
    
    /**
     * Valida configurações do sistema
     */
    validateSettings: (data) => {
        const schema = {
            notificationEmail: {
                label: 'E-mail de Notificação',
                rules: []
            },
            alertThreshold: {
                label: 'Limite de Alerta',
                rules: [{ type: 'integer', params: [1, 100] }]
            },
            calibrationAlertDays: {
                label: 'Dias de Antecedência para Alerta de Calibração',
                rules: [{ type: 'integer', params: [1, 365] }]
            },
            schedulePassword: {
                label: 'Senha do Cronograma',
                rules: [{ type: 'minLength', params: [3] }]
            }
        };
        
        return validator.validateForm(data, schema);
    }
};

// --- SISTEMA DE NOTIFICAÇÕES PUSH ---
/**
 * Sistema avançado de notificações com suporte a notificações do navegador
 */
const notificationSystem = {
    /**
     * Configurações das notificações
     */
    config: {
        enabled: true,
        browserNotifications: false, // Desabilitado para evitar pop-ups do Windows
        soundEnabled: true,
        autoClose: true,
        autoCloseDelay: 10000
    },
    
    /**
     * Fila de notificações ativas
     */
    activeToasts: [],
    
    /**
     * Inicializa o sistema de notificações
     */
    init: () => {
        // Notificações do navegador desabilitadas para evitar pop-ups do Windows
        notificationSystem.config.browserNotifications = false;
        // Notificações do navegador desabilitadas
        
        // Carrega configurações salvas
        const savedConfig = localStorage.getItem('labcontrol-notifications');
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                notificationSystem.config = { ...notificationSystem.config, ...config };
            } catch (e) {
                console.warn('Erro ao carregar configurações de notificação:', e);
            }
        }
    },
    
    /**
     * Salva configurações de notificação
     */
    saveConfig: () => {
        localStorage.setItem('labcontrol-notifications', JSON.stringify(notificationSystem.config));
    },
    
    /**
     * Envia uma notificação
     */
    send: (title, message, type = 'info', options = {}) => {
        if (!notificationSystem.config.enabled) return;
        
        // Bloqueia notificações para usuários visualizadores
        if (state.currentUser && state.currentUser.permissions.viewOnly) {
            return;
        }
        
        const notification = {
            id: Date.now(),
            title,
            message,
            type, // 'info', 'success', 'warning', 'error'
            timestamp: new Date(),
            ...options
        };
        
        // Notificação visual na interface
        notificationSystem.showToast(notification);
        
        // Notificação do navegador (se habilitada e permitida)
        if (notificationSystem.config.browserNotifications && type !== 'info') {
            notificationSystem.showBrowserNotification(notification);
        }
        
        // Som (se habilitado)
        if (notificationSystem.config.soundEnabled && type !== 'info') {
            notificationSystem.playSound(type);
        }
        
        // Salva no histórico
        notificationSystem.addToHistory(notification);
        
        return notification.id;
    },
    
    /**
     * Mostra toast melhorado na interface
     */
    showToast: (notification) => {
        const toast = document.createElement('div');
        
        // Calcula a posição vertical baseada no número de toasts ativos
        const spacing = 20; // Espaçamento entre toasts
        const bottomOffset = 20; // Offset inicial do bottom
        
        // Calcula a posição baseada na altura real dos toasts existentes
        let verticalPosition = bottomOffset;
        notificationSystem.activeToasts.forEach(existingToast => {
            const rect = existingToast.getBoundingClientRect();
            verticalPosition += rect.height + spacing;
        });
        
        toast.className = `fixed right-5 max-w-md bg-white border-l-4 rounded-lg shadow-xl z-50 transform translate-x-full transition-all duration-300 ease-in-out no-dark`;
        toast.style.bottom = `${verticalPosition}px`;
        
        // Define cor baseada no tipo
        const colors = {
            info: 'border-blue-500 bg-blue-50',
            success: 'border-green-500 bg-green-50',
            warning: 'border-yellow-500 bg-yellow-50',
            error: 'border-red-500 bg-red-50'
        };
        
        const icons = {
            info: '📋',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };
        
        toast.className += ` ${colors[notification.type] || colors.info}`;
        
        // Formatar mensagem com quebras de linha preservadas
        const formattedMessage = (notification.message || '').replace(/\n/g, '<br>');
        
        toast.innerHTML = `
            <div class="p-5">
                <div class="flex items-start">
                    <div class="flex-shrink-0">
                        <span class="text-2xl">${icons[notification.type] || icons.info}</span>
                    </div>
                    <div class="ml-4 flex-1">
                        <h4 class="text-base font-semibold text-gray-900 mb-2">${notification.title}</h4>
                        <div class="text-sm text-black leading-relaxed mb-3">${formattedMessage}</div>
                        <div class="flex items-center justify-between">
                            <p class="text-xs text-black">${notification.timestamp.toLocaleString()}</p>
                            ${notification.actionButton ? `
                                <button class="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-md font-medium" onclick="${notification.actionButton.action.toString()}(); notificationSystem.removeToast(this.closest('.fixed'));">
                                    ${notification.actionButton.text}
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="ml-3 flex-shrink-0">
                        <button class="text-gray-400 hover:text-gray-600 focus:outline-none p-1" onclick="notificationSystem.removeToast(this.closest('.fixed'))">
                            <span class="sr-only">Fechar</span>
                            <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Adiciona à fila de toasts ativos
        notificationSystem.activeToasts.push(toast);
        
        document.body.appendChild(toast);
        
        // Anima entrada
        setTimeout(() => {
            toast.classList.remove('translate-x-full');
        }, 100);
        
        // Auto-remove se configurado
        if (notificationSystem.config.autoClose) {
            setTimeout(() => {
                notificationSystem.removeToast(toast);
            }, notificationSystem.config.autoCloseDelay);
        }
    },
    
    /**
     * Remove um toast e reposiciona os restantes
     */
    removeToast: (toast) => {
        if (!toast || !toast.parentNode) return;
        
        // Remove da fila de toasts ativos
        const index = notificationSystem.activeToasts.indexOf(toast);
        if (index > -1) {
            notificationSystem.activeToasts.splice(index, 1);
        }
        
        // Anima saída
        toast.classList.add('translate-x-full');
        
        // Remove do DOM após animação
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
        
        // Reposiciona os toasts restantes
        notificationSystem.repositionToasts();
    },
    clearHistory: () => {
        try {
            localStorage.removeItem('labcontrol-notification-history');
            // Histórico de notificações limpo
        } catch (e) {
            console.warn('Erro ao limpar histórico de notificações:', e);
        }
    },
    
    /**
     * Reposiciona todos os toasts ativos
     */
    repositionToasts: () => {
        const spacing = 20;
        const bottomOffset = 20;
        
        let currentPosition = bottomOffset;
        notificationSystem.activeToasts.forEach((toast, index) => {
            toast.style.bottom = `${currentPosition}px`;
            const rect = toast.getBoundingClientRect();
            currentPosition += rect.height + spacing;
        });
    },
    
    /**
     * Mostra notificação do navegador (DESABILITADO para evitar pop-ups do Windows)
     */
    showBrowserNotification: (notification) => {
        // Função desabilitada para evitar pop-ups do Windows
        // As notificações são mostradas apenas como toasts na interface
        // Notificação enviada
        return;
    },
    
    /**
     * Reproduz som de notificação
     */
    playSound: (type) => {
        // Cria um som simples usando Web Audio API
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Diferentes frequências para diferentes tipos
            const frequencies = {
                success: 800,
                warning: 600,
                error: 400
            };
            
            oscillator.frequency.setValueAtTime(frequencies[type] || 600, audioContext.currentTime);
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (e) {
            console.warn('Não foi possível reproduzir som de notificação:', e);
        }
    },
    
    /**
     * Adiciona notificação ao histórico
     */
    addToHistory: (notification) => {
        let history = [];
        try {
            const savedHistory = localStorage.getItem('labcontrol-notification-history');
            if (savedHistory) {
                history = JSON.parse(savedHistory);
            }
        } catch (e) {
            console.warn('Erro ao carregar histórico de notificações:', e);
        }
        
        history.unshift(notification);
        
        // Mantém apenas as últimas 50 notificações
        if (history.length > 50) {
            history = history.slice(0, 50);
        }
        
        localStorage.setItem('labcontrol-notification-history', JSON.stringify(history));
    },
    
    /**
     * Obtém histórico de notificações
     */
    getHistory: () => {
        try {
            const savedHistory = localStorage.getItem('labcontrol-notification-history');
            return savedHistory ? JSON.parse(savedHistory) : [];
        } catch (e) {
            console.warn('Erro ao carregar histórico de notificações:', e);
            return [];
        }
    },
    
    /**
     * Verifica alertas de estoque baixo
     */
    checkStockAlerts: () => {
        // Bloqueia alertas de estoque para usuários visualizadores
        if (state.currentUser && state.currentUser.permissions.viewOnly) {
            return;
        }
        
        const possibleAssaysResult = calculations.calculatePossibleAssays();
        const possibleAssays = possibleAssaysResult.count || possibleAssaysResult;
        const threshold = state.settings.alertThreshold || 24;
        
        if (possibleAssays <= threshold) {
            notificationSystem.send(
                'Alerta de Estoque Baixo Detectado',
                `📊 RESULTADO: Com base no inventário disponível, apenas ${possibleAssays} ensaios podem ser realizados.\n⚠️ AÇÃO NECESSÁRIA: Este número está abaixo do limite configurado (${threshold} ensaios). É recomendado iniciar o processo de compra de novos insumos para garantir a continuidade das operações do laboratório.\n📧 Use o botão abaixo para enviar um e-mail de alerta para o responsável pelas compras.`,
                'warning',
                {
                    persistent: true,
                    actionButton: {
                        text: 'Enviar E-mail',
                        action: () => {
                            const subject = encodeURIComponent("Alerta de Estoque Baixo de Insumos para Ensaios");
                            const body = encodeURIComponent(`O número de ensaios possíveis com o estoque atual atingiu o nível crítico de ${possibleAssays}.\n\nÉ necessário iniciar o processo de compra de novos insumos.\n\nAtenciosamente,\nEquipe EFI-LAV.`);
                            const emailsForOutlook = state.settings.notificationEmail.replace(/,/g, ';');
                            window.open(`mailto:${emailsForOutlook}?subject=${subject}&body=${body}`);
                        }
                    }
                }
            );
        }
    },
    
    /**
     * Verifica alertas de validade
     */
    checkValidityAlerts: () => {
        // Bloqueia alertas de validade para usuários visualizadores
        if (state.currentUser && state.currentUser.permissions.viewOnly) {
            return;
        }
        
        const today = new Date();
        const warningDays = 30; // Alerta 30 dias antes do vencimento
        const warningDate = new Date(today.getTime() + (warningDays * 24 * 60 * 60 * 1000));
        
        const expiringItems = state.inventory.filter(item => {
            const validityDate = new Date(item.validity);
            return validityDate <= warningDate && validityDate > today;
        });
        
        if (expiringItems.length > 0) {
            const itemsList = expiringItems.map(item => 
                `${item.reagent} (${item.manufacturer}) - Lote: ${item.lot}`
            ).join('\n');
            
            const daysText = warningDays === 1 ? 'dia' : 'dias';
            notificationSystem.send(
                'Reagentes Próximos ao Vencimento',
                `📅 RESULTADO: Foram identificados ${expiringItems.length} item(ns) que vencem em menos de ${warningDays} ${daysText}:\n\n${itemsList}`,
                'warning'
            );
        }
    },
    
    /**
     * Verifica alertas de calibração de equipamentos
     */
    checkCalibrationAlerts: () => {
        // Bloqueia alertas para usuários visualizadores
        if (state.currentUser && state.currentUser.permissions.viewOnly) {
            return;
        }
        
        const today = new Date();
        const warningDays = state.settings.calibrationAlertDays || 30; // Usa configuração do usuário
        const warningDate = new Date(today.getTime() + (warningDays * 24 * 60 * 60 * 1000));
        
        const equipmentsNeedingCalibration = state.calibrationEquipments.filter(equipment => {
            const validityDate = new Date(equipment.validity);
            // Exclui equipamentos que já estão em calibração
            return validityDate <= warningDate && validityDate > today && equipment.calibrationStatus !== 'em_calibracao';
        });
        
        if (equipmentsNeedingCalibration.length > 0) {
            const equipmentsList = equipmentsNeedingCalibration.map(equipment => {
                const validityDate = new Date(equipment.validity);
                const daysUntilExpiry = Math.ceil((validityDate - today) / (1000 * 60 * 60 * 24));
                return `${equipment.tag} - ${equipment.equipment} (${daysUntilExpiry} dias)`;
            }).join('\n');
                        
            notificationSystem.send(
                'Equipamentos Próximos da Calibração',
                `📅 RESULTADO: Foram identificados ${equipmentsNeedingCalibration.length} equipamento(s) que precisam de calibração em menos de ${warningDays} dias:\n${equipmentsList}\n.`,
                'warning',
            );
        }
    },
    
    /**
     * Inicia verificações automáticas
     */
    startAutoChecks: () => {        
        // Verificação inicial após 20 segundos
        setTimeout(() => {
            // Bloqueia verificações automáticas para usuários visualizadores
            if (state.currentUser && state.currentUser.permissions.viewOnly) {
                return;
            }
            
            notificationSystem.checkStockAlerts();
            notificationSystem.checkValidityAlerts();
            notificationSystem.checkCalibrationAlerts();
        }, 7500);
    }
 };
const SUPPLIER_COLORS = {
    'Swissatest': '#3b82f6', // Azul
    'MHC': '#db2777',        // Rosa
    'Default': '#6b7280'     // Cinza para fallback
};
// --- SISTEMA DE LOGS DE AUDITORIA ---
/**
 * Sistema de auditoria para rastreamento de alterações e ações dos usuários
 */
const auditSystem = {
    /**
     * Configurações do sistema de auditoria
     */
    config: {
        enabled: true,
        maxLogs: 1000, // Máximo de logs mantidos
        storageKey: 'labcontrol-audit-logs',
        sensitiveFields: ['password', 'token', 'key'] // Campos que não devem ser logados
    },
    
    /**
     * Tipos de ações auditáveis
     */
    actionTypes: {
        CREATE: 'create',
        UPDATE: 'update',
        DELETE: 'delete',
        LOGIN: 'login',
        LOGOUT: 'logout',
        VIEW: 'view',
        EXPORT: 'export',
        IMPORT: 'import',
        BACKUP: 'backup',
        RESTORE: 'restore',
        SETTINGS: 'settings'
    },
    
    /**
     * Categorias de recursos
     */
    resourceTypes: {
        INVENTORY: 'inventory',
        ASSAY: 'assay',
        SAFETY_ASSAY: 'safety_assay',
        HOLIDAY: 'holiday',
        CALIBRATION: 'calibration',
        USER: 'user',
        SETTINGS: 'settings',
        BACKUP: 'backup',
        REPORT: 'report'
    },
    
    /**
     * Registra uma ação de auditoria
     */
    log: (action, resource, details = {}) => {
        if (!auditSystem.config.enabled) return;
        
        const logEntry = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            user: state.currentUser ? {
                username: state.currentUser.username,
                type: state.currentUser.type,
                displayName: state.currentUser.displayName
            } : { username: 'anonymous', type: 'unknown', displayName: 'Usuário Anônimo' },
            action: action,
            resource: resource,
            details: auditSystem.sanitizeDetails(details),
            userAgent: navigator.userAgent,
            ip: 'local', // Em um ambiente real, seria obtido do servidor
            sessionId: auditSystem.getSessionId()
        };
        
        // Adiciona contexto adicional baseado no tipo de ação
        auditSystem.addContextualInfo(logEntry);
        
        // Salva o log
        auditSystem.saveLog(logEntry);
        
        // Log no console para desenvolvimento
        // Log de auditoria registrado
        
        return logEntry.id;
    },
    
    /**
     * Remove informações sensíveis dos detalhes
     */
    sanitizeDetails: (details) => {
        const sanitized = { ...details };
        
        // Remove campos sensíveis
        auditSystem.config.sensitiveFields.forEach(field => {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        });
        
        // Remove dados muito grandes
       safeObjectKeys(sanitized || {}).forEach(key => {
    if (typeof sanitized[key] === 'string' && sanitized[key].length > 1000) {
        sanitized[key] = sanitized[key].substring(0, 1000) + '... [TRUNCATED]';
    }
});
        
        return sanitized;
    },
    
    /**
     * Adiciona informações contextuais ao log
     */
    addContextualInfo: (logEntry) => {
        // Adiciona informações sobre o estado atual
        logEntry.context = {
            currentPage: auditSystem.getCurrentPage(),
            inventoryCount: state.inventory.length,
            assaysCount: state.historicalAssays.length,
            scheduledAssaysCount: state.scheduledAssays.length
        };
        
        // Adiciona informações específicas baseadas no tipo de recurso
        switch (logEntry.resource) {
            case auditSystem.resourceTypes.INVENTORY:
                logEntry.context.totalInventoryValue = auditSystem.calculateInventoryValue();
                break;
            case auditSystem.resourceTypes.ASSAY:
                logEntry.context.totalAssays = state.historicalAssays.length;
                break;
        }
    },
    
    /**
     * Obtém a página atual
     */
    getCurrentPage: () => {
        const visiblePage = document.querySelector('.page:not(.hidden)');
        return visiblePage ? visiblePage.id : 'unknown';
    },
    
    /**
     * Calcula valor total do inventário (exemplo)
     */
    calculateInventoryValue: () => {
        return state.inventory.reduce((total, item) => total + (item.quantity || 0), 0);
    },
    
    /**
     * Obtém ou cria um ID de sessão
     */
    getSessionId: () => {
        let sessionId = sessionStorage.getItem('labcontrol-session-id');
        if (!sessionId) {
            sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
            sessionStorage.setItem('labcontrol-session-id', sessionId);
        }
        return sessionId;
    },
    
    /**
     * Salva um log no localStorage
     */
    saveLog: (logEntry) => {
        try {
            let logs = auditSystem.getLogs();
            logs.unshift(logEntry); // Adiciona no início (mais recente primeiro)
            
            // Limita o número de logs
            if (logs.length > auditSystem.config.maxLogs) {
                logs = logs.slice(0, auditSystem.config.maxLogs);
            }
            
            localStorage.setItem(auditSystem.config.storageKey, JSON.stringify(logs));
        } catch (error) {
            console.error('Erro ao salvar log de auditoria:', error);
        }
    },
    
    /**
     * Obtém todos os logs
     */
    getLogs: (filters = {}) => {
        try {
            const logs = JSON.parse(localStorage.getItem(auditSystem.config.storageKey) || '[]');
            
            // Aplica filtros se fornecidos
            if (safeObjectKeys(filters || {}).length === 0) {
                return logs;
            }
            
            return logs.filter(log => {
                return Object.entries(filters).every(([key, value]) => {
                    if (key === 'dateFrom') {
                        return new Date(log.timestamp) >= new Date(value);
                    }
                    if (key === 'dateTo') {
                        return new Date(log.timestamp) <= new Date(value);
                    }
                    if (key === 'user') {
                        return log.user.username.toLowerCase().includes(value.toLowerCase());
                    }
                    return log[key] === value;
                });
            });
        } catch (error) {
            console.error('Erro ao carregar logs de auditoria:', error);
            return [];
        }
    },
    
    /**
     * Obtém estatísticas dos logs
     */
    getStatistics: (days = 30) => {
        const logs = auditSystem.getLogs();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const recentLogs = logs.filter(log => new Date(log.timestamp) >= cutoffDate);
        
        const stats = {
            totalLogs: logs.length,
            recentLogs: recentLogs.length,
            actionCounts: {},
            resourceCounts: {},
            userCounts: {},
            dailyActivity: {}
        };
        
        recentLogs.forEach(log => {
            // Contagem por ação
            stats.actionCounts[log.action] = (stats.actionCounts[log.action] || 0) + 1;
            
            // Contagem por recurso
            stats.resourceCounts[log.resource] = (stats.resourceCounts[log.resource] || 0) + 1;
            
            // Contagem por usuário
            stats.userCounts[log.user.username] = (stats.userCounts[log.user.username] || 0) + 1;
            
            // Atividade diária
            const date = log.timestamp.split('T')[0];
            stats.dailyActivity[date] = (stats.dailyActivity[date] || 0) + 1;
        });
        
        return stats;
    },
    
    /**
     * Exporta logs para CSV
     */
    exportToCsv: (filters = {}) => {
        const logs = auditSystem.getLogs(filters);
        
        if (logs.length === 0) {
            notificationSystem.send('Aviso', 'Nenhum log encontrado para exportar.', 'warning');
            return;
        }
        
        const headers = ['Timestamp', 'Usuário', 'Ação', 'Recurso', 'Detalhes', 'IP', 'Sessão'];
        const csvContent = [
            headers.join(','),
            ...logs.map(log => [
                log.timestamp,
                `"${log.user.displayName} (${log.user.username})"`,
                log.action,
                log.resource,
                `"${JSON.stringify(log.details).replace(/"/g, '""')}"`,
                log.ip,
                log.sessionId
            ].join(','))
        ].join('\n');
        
        // Cria e baixa o arquivo
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Log da exportação
        auditSystem.log(auditSystem.actionTypes.EXPORT, auditSystem.resourceTypes.REPORT, {
            type: 'audit_logs_csv',
            recordCount: logs.length,
            filters: filters
        });
        
        notificationSystem.send('Sucesso', `${logs.length} logs exportados com sucesso!`, 'success');
    },
    
    /**
     * Limpa logs antigos
     */
    cleanOldLogs: (daysToKeep = 90) => {
        const logs = auditSystem.getLogs();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        const filteredLogs = logs.filter(log => new Date(log.timestamp) >= cutoffDate);
        const removedCount = logs.length - filteredLogs.length;
        
        if (removedCount > 0) {
            localStorage.setItem(auditSystem.config.storageKey, JSON.stringify(filteredLogs));
            // Logs antigos removidos
        }
        
        return removedCount;
    },
    
    /**
     * Funções de conveniência para logging de ações específicas
     */
    logInventoryAction: (action, item, oldData = null) => {
        const details = {
            itemId: item.id,
            reagent: item.reagent,
            manufacturer: item.manufacturer,
            lot: item.lot,
            quantity: item.quantity
        };
        
        if (oldData && action === auditSystem.actionTypes.UPDATE) {
            details.changes = auditSystem.getChanges(oldData, item);
        }
        
        return auditSystem.log(action, auditSystem.resourceTypes.INVENTORY, details);
    },
    
    logAssayAction: (action, assay, oldData = null) => {
        const details = {
            assayId: assay.id,
            assayName: assay.assayName,
            manufacturer: assay.assayManufacturer,
            status: assay.status
        };
        
        if (oldData && action === auditSystem.actionTypes.UPDATE) {
            details.changes = auditSystem.getChanges(oldData, assay);
        }
        
        return auditSystem.log(action, auditSystem.resourceTypes.ASSAY, details);
    },
    
    logUserAction: (action, details = {}) => {
        return auditSystem.log(action, auditSystem.resourceTypes.USER, details);
    },
    
    logSettingsAction: (action, changes = {}) => {
        return auditSystem.log(action, auditSystem.resourceTypes.SETTINGS, { changes });
    },
    
    /**
     * Compara dois objetos e retorna as diferenças
     */
    getChanges: (oldData, newData) => {
        const changes = {};
        
        safeObjectKeys(newData || {}).forEach(key => {
            if (oldData[key] !== newData[key]) {
                changes[key] = {
                    from: oldData[key],
                    to: newData[key]
                };
            }
        });
        
        return changes;
    }
 };

// --- SISTEMA DE CACHE INTELIGENTE ---
/**
 * Sistema de cache para melhorar performance da aplicação
 */
const cacheSystem = {
    /**
     * Configurações do cache
     */
    config: {
        enabled: true,
        maxSize: 100, // Máximo de entradas no cache
        defaultTTL: 5 * 60 * 1000, // 5 minutos em ms
        cleanupInterval: 60 * 1000, // Limpeza a cada minuto
        storageKey: 'labcontrol-cache'
    },
    
    /**
     * Armazenamento do cache em memória
     */
    memory: new Map(),
    
    /**
     * Armazenamento persistente (localStorage)
     */
    persistent: {
        get: (key) => {
            try {
                const data = localStorage.getItem(`${cacheSystem.config.storageKey}-${key}`);
                return data ? JSON.parse(data) : null;
            } catch (e) {
                return null;
            }
        },
        
        set: (key, value, ttl) => {
            try {
                const data = {
                    value,
                    timestamp: Date.now(),
                    ttl: ttl || cacheSystem.config.defaultTTL
                };
                localStorage.setItem(`${cacheSystem.config.storageKey}-${key}`, JSON.stringify(data));
            } catch (e) {
                console.warn('Erro ao salvar no cache persistente:', e);
            }
        },
        
        remove: (key) => {
            localStorage.removeItem(`${cacheSystem.config.storageKey}-${key}`);
        }
    },
    
    /**
     * Inicializa o sistema de cache
     */
    init: () => {
        if (!cacheSystem.config.enabled) return;
        
        // Inicia limpeza automática
        setInterval(() => {
            cacheSystem.cleanup();
        }, cacheSystem.config.cleanupInterval);
        
        // Sistema de cache inicializado
    },
    
    /**
     * Obtém um valor do cache
     */
    get: (key, persistent = false) => {
        if (!cacheSystem.config.enabled) return null;
        
        const storage = persistent ? cacheSystem.persistent : cacheSystem.memory;
        
        if (persistent) {
            const data = storage.get(key);
            if (data && cacheSystem.isValid(data)) {
                return data.value;
            }
            if (data) {
                storage.remove(key); // Remove se expirado
            }
            return null;
        } else {
            const data = storage.get(key);
            if (data && cacheSystem.isValid(data)) {
                return data.value;
            }
            if (data) {
                storage.delete(key); // Remove se expirado
            }
            return null;
        }
    },
    
    /**
     * Define um valor no cache
     */
    set: (key, value, ttl = null, persistent = false) => {
        if (!cacheSystem.config.enabled) return;
        
        const data = {
            value,
            timestamp: Date.now(),
            ttl: ttl || cacheSystem.config.defaultTTL
        };
        
        if (persistent) {
            cacheSystem.persistent.set(key, value, data.ttl);
        } else {
            // Limita o tamanho do cache em memória
            if (cacheSystem.memory.size >= cacheSystem.config.maxSize) {
                const firstKey = cacheSystem.memory.keys().next().value;
                cacheSystem.memory.delete(firstKey);
            }
            cacheSystem.memory.set(key, data);
        }
    },
    
    /**
     * Remove um valor do cache
     */
    remove: (key, persistent = false) => {
        if (persistent) {
            cacheSystem.persistent.remove(key);
        } else {
            cacheSystem.memory.delete(key);
        }
    },
    
    /**
     * Limpa todo o cache
     */
    clear: (persistent = false) => {
        if (persistent) {
            // Remove todas as chaves do localStorage que começam com o prefixo
            safeObjectKeys(localStorage || {}).forEach(key => {
                if (key.startsWith(cacheSystem.config.storageKey)) {
                    localStorage.removeItem(key);
                }
            });
        } else {
            cacheSystem.memory.clear();
        }
    },
    
    /**
     * Verifica se um item do cache ainda é válido
     */
    isValid: (data) => {
        return (Date.now() - data.timestamp) < data.ttl;
    },
    
    /**
     * Limpa itens expirados
     */
    cleanup: () => {
        let cleanedCount = 0;
        
        // Limpeza do cache em memória - mais eficiente
        const keysToDelete = [];
        for (const [key, data] of cacheSystem.memory.entries()) {
            if (!cacheSystem.isValid(data)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => {
            cacheSystem.memory.delete(key);
            cleanedCount++;
        });
        
        // Limpeza do cache persistente - com controle de erro
        try {
            const storageKeys = safeObjectKeys(localStorage || {});
            const cacheKeys = storageKeys.filter(key => key.startsWith(cacheSystem.config.storageKey));
            
            cacheKeys.forEach(key => {
                try {
                    const data = cacheSystem.persistent.get(key.replace(`${cacheSystem.config.storageKey}-`, ''));
                    if (data && !cacheSystem.isValid(data)) {
                        localStorage.removeItem(key);
                        cleanedCount++;
                    }
                } catch (e) {
                    // Remove chaves corrompidas
                    localStorage.removeItem(key);
                    cleanedCount++;
                }
            });
        } catch (e) {
            console.warn('Erro durante limpeza do cache persistente:', e);
        }
        
        if (cleanedCount > 0) {
            // Cache limpo
        }
    },
    
    /**
     * Gera uma chave de cache baseada em parâmetros
     */
    generateKey: (...params) => {
        return params.map(p => 
            typeof p === 'object' ? JSON.stringify(p) : String(p)
        ).join('|');
    },
    
    /**
     * Wrapper para funções com cache automático
     */
    memoize: (fn, keyGenerator = null, ttl = null, persistent = false) => {
        return function(...args) {
            const key = keyGenerator ? keyGenerator(...args) : cacheSystem.generateKey(fn.name, ...args);
            
            // Tenta obter do cache
            let result = cacheSystem.get(key, persistent);
            
            if (result === null) {
                // Executa a função e cacheia o resultado
                result = fn.apply(this, args);
                cacheSystem.set(key, result, ttl, persistent);
            }
            
            return result;
        };
    },
    
    /**
     * Cache específico para cálculos
     */
    calculations: {
        /**
         * Cache para cálculo de consumo
         */
        getConsumption: (nominalLoad, cycles) => {
            const base = (16 * nominalLoad + 54) * cycles;
            const tiras = Math.ceil(calculations.calculateTiras(nominalLoad) * cycles);
            return {
                poBase: base * 0.77,
                perborato: base * 0.20,
                taed: base * 0.03,
                tiras: tiras,
            };
        },
        
        /**
         * Cache para ensaios possíveis
         */
        getPossibleAssays: () => {
            if (!state.inventory || state.inventory.length === 0) return 0;
            
            const totals = { poBase: 0, perborato: 0, taed: 0, tiras: 0 };
            state.inventory.forEach(item => {
                const reagentKey = REAGENT_KEYS[item.reagent];
                if (reagentKey && totals.hasOwnProperty(reagentKey)) {
                    totals[reagentKey] += item.quantity;
                }
            });
            
            const possibleAssays = [
                Math.floor(totals.poBase / (16 * 5 + 54) * 0.77),
                Math.floor(totals.perborato / (16 * 5 + 54) * 0.20),
                Math.floor(totals.taed / (16 * 5 + 54) * 0.03),
                Math.floor(totals.tiras / calculations.calculateTiras(5))
            ];
            
            return Math.min(...possibleAssays);
        }
    },
    
    /**
     * Cache específico para renderização
     */
    rendering: {
        /**
         * Cache para dados de gráficos
         */
        getChartData: (chartType, dataHash) => {
            // Esta função será chamada pelos renderizadores de gráfico
            return null; // Placeholder - será implementado pelos renderizadores
        },
        
        /**
         * Invalida cache de renderização quando dados mudam
         */
        invalidateOnDataChange: () => {
            // Remove todos os caches de renderização
            for (const [key] of cacheSystem.memory.entries()) {
                if (key.startsWith('chart-') || key.startsWith('table-') || key.startsWith('dashboard-')) {
                    cacheSystem.memory.delete(key);
                }
            }
        }
    },
    
    /**
     * Obtém estatísticas do cache
     */
    getStats: () => {
        const memoryStats = {
            size: cacheSystem.memory.size,
            maxSize: cacheSystem.config.maxSize,
            hitRate: 0 // Seria calculado com contadores de hit/miss
        };
        
        const persistentKeys = safeObjectKeys(localStorage || {}).filter(key => 
            key.startsWith(cacheSystem.config.storageKey)
        );
        
        const persistentStats = {
            size: persistentKeys.length,
            totalSize: persistentKeys.reduce((total, key) => {
                return total + (localStorage.getItem(key)?.length || 0);
            }, 0)
        };
        
        return {
            memory: memoryStats,
            persistent: persistentStats,
            enabled: cacheSystem.config.enabled
        };
    },

};

/**
 * Garante que a API do VS Code esteja disponível, com um fallback robusto
 * para evitar erros de referência fora do ambiente do VS Code.
 * @returns {Object} A API do VS Code ou um objeto de fallback com postMessage vazio.
 */
// Inicialização resiliente da API do VS Code sem redeclarar identificador global
(function initVsCodeApi() {
    try {
        if (typeof window !== 'undefined') {
            if (!window.vscode) {
                if (typeof acquireVsCodeApi !== 'undefined') {
                    window.vscode = acquireVsCodeApi();
                } else {
                    console.warn("API do VS Code não está disponível. Fallback ativo.");
                    window.vscode = { postMessage: () => {} };
                }
            }
        }
    } catch (error) {
        console.error("Erro ao inicializar a API do VS Code. Usando fallback.", error);
        if (typeof window !== 'undefined' && !window.vscode) {
            window.vscode = { postMessage: () => {} };
        }
    }
})();

// Constantes globais
// -----------------------------------------------------------------------------
/**
 * Mapeamento dos status dos ensaios para descrições mais amigáveis na UI.
 * @type {Object.<string, string>}
 */
const ASSAY_STATUS_MAP = {
    'aguardando': 'Aguardando Amostra',
    'labelo': 'Amostra no LABELO',
    'andamento': 'Ensaios em Andamento',
    'incompleto': 'Ensaio Incompleto',
    'concluido': 'Ensaios concluído',
    'relatorio': 'Relatório Emitido',
    'pendente': 'Ensaios Pendente'
};
/**
 * Nomes das categorias de Segurança Elétrica, usados no Gantt.
 * @type {string[]}
 */
const SAFETY_CATEGORY_NAMES = ['Vitor Leal', 'Wellyngton Vianna', 'Leonardo Ebres'];

/**
 * Mapeamento dos tipos de ensaios para descrições amigáveis.
 * @type {Object.<string, string>}
 */
const ASSAY_TYPE_MAP = {
    'homologation': 'Homologação',
    'acp': 'AcP',
    'secadora': 'Ensaio de Secadora',
    'férias': 'Férias',
    'calibracao-energia': 'Calibração de Energia',
    'calibracao-pressao-temp': 'Calibração de Pressão e Temperatura',
    'seguranca-eletrica': 'Segurança Elétrica',
    'acao-corretiva': 'Ação Corretiva'
};

/**
 * Cores para reagentes, usadas nos gráficos.
 * @type {Object.<string, string>}
 */
const REAGENT_COLORS = {
    'Pó Base': '#3b82f6',
    'Perborato': '#22c55e',
    'TAED': '#f59e0b',
    'Tiras de sujidade': '#a855f7'
};

/**
 * Nomes internos dos reagentes para usar como chaves no objeto de dados.
 * @type {Object.<string, string>}
 */
const REAGENT_NAMES = {
    'poBase': 'Pó Base',
    'perborato': 'Perborato',
    'taed': 'TAED',
    'tiras': 'Tiras de sujidade'
};

const REAGENT_KEYS = Object.fromEntries(
    Object.entries(REAGENT_NAMES).map(([key, value]) => [value, key])
);

/**
 * Cores para gráficos, rotacionadas para garantir variedade visual.
 * @type {string[]}
 */
const COLOR_PALETTE = ['#4f46e5', '#db2777', '#f59e0b', '#10b981', '#3b82f6',
    '#8b5cf6', '#f43f5e', '#06b6d4', '#f97316'
];

/**
 * Função global para apenas validar estoque de reagentes (sem deduzir)
 * @param {string} reagentKey - Chave do reagente (poBase, perborato, taed, tiras)
 * @param {Array} lotsArray - Array de lotes com ciclos
 * @param {number} nominalLoad - Carga nominal do ensaio
 * @returns {boolean} - True se há estoque suficiente
 */
const validateStock = (reagentKey, lotsArray, nominalLoad) => {
    const reagentName = REAGENT_NAMES[reagentKey];
    if (!lotsArray || lotsArray.length === 0) return true;
    
    // Apenas valida se há estoque suficiente para cada lote individualmente
    for (const { lot, cycles } of lotsArray) {
        let consumption;
        // Usa as mesmas fórmulas diretas do handleFinishAssay
        if (reagentKey === 'poBase') {
            consumption = (16 * nominalLoad + 54) * cycles * 0.77;
        } else if (reagentKey === 'perborato') {
            consumption = (16 * nominalLoad + 54) * cycles * 0.20;
        } else if (reagentKey === 'taed') {
            consumption = (16 * nominalLoad + 54) * cycles * 0.03;
        } else if (reagentKey === 'tiras') {
            consumption = calculations.calculateTiras(nominalLoad) * cycles;
        }
        
        const itemIndex = state.inventory.findIndex(i => i.lot === lot && i.reagent === reagentName);
        if (itemIndex === -1 || state.inventory[itemIndex].quantity < consumption) {
            utils.showToast(`Estoque insuficiente para o lote ${lot} de ${reagentName}. Necessário: ${consumption.toFixed(2)}, Disponível: ${state.inventory[itemIndex]?.quantity.toFixed(2) || 0}`, true);
            return false;
        }
    }
    
    return true;
};

/**
 * Função global para validar e deduzir estoque de reagentes
 * @param {string} reagentKey - Chave do reagente (poBase, perborato, taed, tiras)
 * @param {Array} lotsArray - Array de lotes com ciclos
 * @param {number} nominalLoad - Carga nominal do ensaio
 * @returns {boolean} - True se o estoque foi validado e deduzido com sucesso
 */
const checkAndDeductStock = (reagentKey, lotsArray, nominalLoad) => {
    const reagentName = REAGENT_NAMES[reagentKey];
    if (!lotsArray || lotsArray.length === 0) return true;
    
    // Primeiro valida se há estoque suficiente para cada lote individualmente
    for (const { lot, cycles } of lotsArray) {
        let consumption;
        // Usa as mesmas fórmulas diretas do handleFinishAssay
        if (reagentKey === 'poBase') {
            consumption = (16 * nominalLoad + 54) * cycles * 0.77;
        } else if (reagentKey === 'perborato') {
            consumption = (16 * nominalLoad + 54) * cycles * 0.20;
        } else if (reagentKey === 'taed') {
            consumption = (16 * nominalLoad + 54) * cycles * 0.03;
        } else if (reagentKey === 'tiras') {
            consumption = calculations.calculateTiras(nominalLoad) * cycles;
        }
        
        const itemIndex = state.inventory.findIndex(i => i.lot === lot && i.reagent === reagentName);
        if (itemIndex === -1 || state.inventory[itemIndex].quantity < consumption) {
            utils.showToast(`Estoque insuficiente para o lote ${lot} de ${reagentName}. Necessário: ${consumption.toFixed(2)}, Disponível: ${state.inventory[itemIndex]?.quantity.toFixed(2) || 0}`, true);
            return false;
        }
    }
    
    // Se a validação passou, deduz o estoque de cada lote individualmente
    for (const { lot, cycles } of lotsArray) {
        let consumption;
        // Usa as mesmas fórmulas diretas do handleFinishAssay
        if (reagentKey === 'poBase') {
            consumption = (16 * nominalLoad + 54) * cycles * 0.77;
        } else if (reagentKey === 'perborato') {
            consumption = (16 * nominalLoad + 54) * cycles * 0.20;
        } else if (reagentKey === 'taed') {
            consumption = (16 * nominalLoad + 54) * cycles * 0.03;
        } else if (reagentKey === 'tiras') {
            consumption = calculations.calculateTiras(nominalLoad) * cycles;
        }
        
        const itemIndex = state.inventory.findIndex(i => i.lot === lot && i.reagent === reagentName);
        state.inventory[itemIndex].quantity -= consumption;
        
        // Log para debug da dedução
        console.log(`[INVENTORY] Deduzido ${consumption.toFixed(2)} de ${reagentName} (lote ${lot}). Novo estoque: ${state.inventory[itemIndex].quantity.toFixed(2)}`);
    }
    
    return true;
};

/**
 * Função global para reverter o desconto de estoque de reagentes
 * @param {string} reagentKey - Chave do reagente (poBase, perborato, taed, tiras)
 * @param {Array} lotsArray - Array de lotes com ciclos
 * @param {number} nominalLoad - Carga nominal do ensaio
 */
const revertStockDeduction = (reagentKey, lotsArray, nominalLoad) => {
    const reagentName = REAGENT_NAMES[reagentKey];
    if (!lotsArray || lotsArray.length === 0) return;
    
    // Adiciona de volta ao estoque o consumo individual de cada lote
    for (const { lot, cycles } of lotsArray) {
        let consumption;
        // Usa as mesmas fórmulas diretas do handleFinishAssay
        if (reagentKey === 'poBase') {
            consumption = (16 * nominalLoad + 54) * cycles * 0.77;
        } else if (reagentKey === 'perborato') {
            consumption = (16 * nominalLoad + 54) * cycles * 0.20;
        } else if (reagentKey === 'taed') {
            consumption = (16 * nominalLoad + 54) * cycles * 0.03;
        } else if (reagentKey === 'tiras') {
            consumption = calculations.calculateTiras(nominalLoad) * cycles;
        }
        
        const itemIndex = state.inventory.findIndex(i => i.lot === lot && i.reagent === reagentName);
        if (itemIndex !== -1) {
            state.inventory[itemIndex].quantity += consumption;
        }
    }
};

/**
 * Configurações para a funcionalidade de arrastar e soltar (drag and drop) no Gantt.
 * O CELL_WIDTH e MIN_DRAG_DISTANCE são definidos em tempo de execução.
 * @type {{CELL_WIDTH: number, MIN_DRAG_DISTANCE: number}}
 */
const DRAG_CONFIG = {
    CELL_WIDTH: 0,
    MIN_DRAG_DISTANCE: 0
};

// Estado da aplicação
// -----------------------------------------------------------------------------
/**
 * Objeto de estado global que armazena todos os dados e o estado atual da UI.
 * Inclui inventário, ensaios, feriados, configurações e estado de interação.
 * * ATUALIZAÇÃO: Adicionada a propriedade `safetyScheduledAssays` para ensaios de segurança elétrica.
 * @typedef {object} ReagentLot - Representa um lote de reagente com ciclos consumidos.
 * @property {string} lot - O número do lote.
 * @property {number} cycles - O número de ciclos consumidos desse lote.
 *
 * @typedef {object} AssayData - Representa os dados de um ensaio.
 * @property {number} id - ID único do ensaio.
 * @property {string} protocol - Protocolo do ensaio.
 * @property {string} status - Status atual do ensaio (ex: 'andamento', 'concluido').
 * @property {object} lots - Lotes de reagentes usados. Pode ser `{string}` ou `{[key: string]: ReagentLot[]}`.
 *
 * @type {{
 * inventory: Array,
 * historicalAssays: AssayData[],
 * scheduledAssays: AssayData[],
 * safetyScheduledAssays: AssayData[], // Nova array para ensaios de segurança
 * originalScheduledAssays: AssayData[],
 * originalSafetyScheduledAssays: AssayData[], // Armazena o estado original para cancelamento
 * holidays: Array,
 * settings: {notificationEmail: string, alertThreshold: number, schedulePassword: string},
 * charts: Object,
 * selectedAssayId: null|number,
 * selectedReagentId: null|number,
 * ganttStart: Date,
 * ganttEnd: Date,
 * isDragging: boolean,
 * dragTarget: null|HTMLElement,
 * dragOffset: {x: number, y: number},
 * initialAssay: null|Object,
 * hasUnsavedChanges: boolean,
 * passwordContext: null|string,
 * isSettingsUnlocked: boolean,
 * draggedAssayId: null|number,
 * dragFinalPosition: null|{left: number, top: number},
 * calibrations: Array
 * }}
 */
const state = {
    inventory: [],
    historicalAssays: [],
    scheduledAssays: [],
    safetyScheduledAssays: [],
    originalScheduledAssays: [],
    originalSafetyScheduledAssays: [],
    holidays: [],
    events: [],
    calibrations: [],
    calibrationEquipments: [],
    undoStack: [],
    maxUndoHistory: 10,
    originalEfficiencyCategories: [], 
    originalSafetyCategories: [],
    pendingHistoricalAssays: [], // Ensaios aguardando confirmação para adicionar ao histórico
    efficiencyCategories: [
        { id: 1, name: 'Terminal 1' },
        { id: 2, name: 'Terminal 2' },
        { id: 3, name: 'Terminal 3' },
        { id: 4, name: 'Terminal 4' },
        { id: 5, name: 'Terminal 5' },
        { id: 6, name: 'Terminal 6' },
        { id: 7, name: 'Terminal 7' },
        { id: 8, name: 'Terminal 8' },
    ],
    safetyCategories: [
        { id: 'A', name: 'Vitor Leal' },
        { id: 'B', name: 'Wellyngton Vianna' },
        { id: 'C', name: 'Leonardo Ebres' },
    ],
    settings: {
        notificationEmail: 'seu-email@exemplo.com',
        alertThreshold: 24,
        calibrationAlertDays: 30,
        schedulePassword: 'lavadoras'
    },
    systemUsers: {},
    charts: {},
    assayLinks: [],
    // Controle de repetição de toast de atualização automática
    lastForceRefreshToastAt: 0,
    lastForceRefreshSignature: '',
    forceRefreshToastCooldownMs: 3000,
    selectedAssayId: null,
    selectedReagentId: null,
    ganttStart: new Date(),
    ganttEnd: new Date(),
    isDragging: false,
    isResizing: false,
    resizeDirection: null,
    dragTarget: null,
    dragOffset: { x: 0, y: 0 },
    initialAssay: null,
    hasUnsavedChanges: false,
    passwordContext: null,
    isSettingsUnlocked: false,
    // Removidas variáveis de drag and drop conflitantes
    ganttInitialRenderDone: false,
    // Sistema de autenticação
    currentUser: null,
    isLoggedIn: false,
    ganttZoomLevel: 25,
    ganttRowHeighLevel: 80,
    // Busca global no Gantt
    ganttSearchQuery: '',
    // Paginação de tabelas de ensaios
    assaysPagination: { dashboard: { page: 1 }, assays: { page: 1 }, pageSize: 10 },
};

// Referências do DOM
// -----------------------------------------------------------------------------
/**
 * Objeto que armazena referências para elementos-chave do DOM para acesso rápido.
 * @type {{
 * loadingSpinner: HTMLElement|null,
 * toast: HTMLElement|null,
 * toastMessage: HTMLElement|null,
 * modal: HTMLElement|null,
 * ganttLabelsContainer: HTMLElement|null,
 * ganttHeaderContainer: HTMLElement|null,
 * ganttGridContainer: HTMLElement|null,
 * ganttPeriodLabel: HTMLElement|null,
 * passwordModal: HTMLElement|null,
 * passwordInput: HTMLElement|null,
 * passwordSubmitBtn: HTMLElement|null,
 * passwordCancelBtn: HTMLElement|null,
 * passwordErrorMessage: HTMLElement|null,
 * settingSchedulePasswordInput: HTMLElement|null,
 * btnSaveSchedulePassword: HTMLElement|null,
 * scheduleActionsContainer: HTMLElement|null,
 * btnSaveSchedule: HTMLElement|null,
 * btnCancelSchedule: HTMLElement|null
 * }}
 */
const DOM = {
    loadingSpinner: document.getElementById('loading-spinner'),
    modal: document.getElementById('modal-template'),
    ganttLabelsContainer: document.getElementById('gantt-labels-container'),
    ganttHeaderContainer: document.getElementById('gantt-header-container'),
    ganttGridContainer: document.getElementById('gantt-grid-container'),
    ganttScrollContainer: document.getElementById('gantt-scroll-container'),
    ganttTooltip: document.getElementById('gantt-tooltip'),
    ganttPeriodLabel: document.getElementById('gantt-period'),
    ganttGlobalSearchInput: document.getElementById('gantt-global-search'),
    passwordModal: document.getElementById('password-modal'),
    passwordInput: document.getElementById('password-input'),
    passwordSubmitBtn: document.getElementById('password-submit-btn'),
    passwordCancelBtn: document.getElementById('password-cancel-btn'),
    passwordErrorMessage: document.getElementById('password-error-message'),
    settingSchedulePasswordInput: document.getElementById('setting-schedule-password'),
    btnSaveSchedulePassword: document.getElementById('btn-save-schedule-password'),
    scheduleActionsContainer: document.getElementById('schedule-actions-container'),
    btnSaveSchedule: document.getElementById('btn-save-schedule'),
    btnCancelSchedule: document.getElementById('btn-cancel-schedule'),
    // Sistema de autenticação
    loadingScreen: document.getElementById('loading-screen'),
    loadingStatus: document.getElementById('loading-status'),
    mainInterface: document.getElementById('main-interface')
};

// Tooltip utilitário para eventos do Gantt e calibrações
const tooltip = {
    showAssay(evt, assay) {
        if (!DOM.ganttTooltip) return;
        const terminalName = (typeof getTerminalName === 'function') ? getTerminalName(assay.setup) : (assay.setup || 'N/A');
        const reportText = assay.report ? assay.report : 'Pendente';
        const periodo = `${utils.formatDate(assay.startDate)} a ${utils.formatDate(assay.endDate)}`;
        const obsText = utils.stripLinkTags(assay.observacoes) || 'Nenhuma observação';    
        const html = `
            <div class="space-y-1">
                <div class="font-semibold">${assay.protocol || 'Sem protocolo'}</div>
                <div class="text-[11px] opacity-80">${periodo}</div>
                <div class="text-xs">Terminal: ${terminalName}</div>
                <div class="text-xs">Relatório: ${reportText}</div>
                <div class="text-xs">Observações: ${obsText}</div>
            </div>
        `;
        DOM.ganttTooltip.innerHTML = html;
        DOM.ganttTooltip.classList.remove('hidden');
        this.position(evt);
    },
    showCalibration(evt, calib) {
        if (!DOM.ganttTooltip) return;
        const periodo = `${utils.formatDate(calib.startDate)} a ${utils.formatDate(calib.endDate)}`;
        const tipo = calib.protocol || 'Calibração';
        const afetados = calib.affectedTerminals || 'Todos';
        const html = `
            <div class="space-y-1">
                <div class="font-semibold">${tipo}</div>
                <div class="text-[11px] opacity-80">${periodo}</div>
                <div class="text-xs">Terminais afetados: ${afetados}</div>
            </div>
        `;
        DOM.ganttTooltip.innerHTML = html;
        DOM.ganttTooltip.classList.remove('hidden');
        this.position(evt);
    },
    showHoliday(evt, holiday) {
        if (!DOM.ganttTooltip) return;
        const periodo = `${utils.formatDate(holiday.startDate)} a ${utils.formatDate(holiday.endDate)}`;
        const html = `
            <div class="space-y-1">
                <div class="font-semibold">${holiday.name}</div>
                <div class="text-[11px] opacity-80">${periodo}</div>
            </div>
        `;
        DOM.ganttTooltip.innerHTML = html;
        DOM.ganttTooltip.classList.remove('hidden');
        this.position(evt);
    },
    showEvent(evt, event) {
        if (!DOM.ganttTooltip) return;
        const periodo = `${utils.formatDate(event.startDate)} a ${utils.formatDate(event.endDate)}`;
        const obsText = (event.description && event.description.trim()) ? event.description : 'Nenhuma Observação';
        const html = `
            <div class="space-y-1">
                <div class="font-semibold">${event.title}</div>
                <div class="text-[11px] opacity-80">${periodo}</div>
                <div class="text-xs">Observações: ${obsText}</div>
            </div>
        `;
        DOM.ganttTooltip.innerHTML = html;
        DOM.ganttTooltip.classList.remove('hidden');
        this.position(evt);
    },
    position(evt) {
        if (!DOM.ganttTooltip) return;
        const padding = 8;
        let x = evt.clientX + 12;
        let y = evt.clientY + 12;
        // Temporariamente torna visível para obter dimensões corretas
        const el = DOM.ganttTooltip;
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (x + rect.width + padding > vw) {
            x = Math.max(padding, vw - rect.width - padding);
        }
        if (y + rect.height + padding > vh) {
            y = Math.max(padding, vh - rect.height - padding);
        }
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
    },
    hide() {
        if (!DOM.ganttTooltip) return;
        DOM.ganttTooltip.classList.add('hidden');
    }
};

// -----------------------------------------------------------------------------
// 2. Lógica Principal da Aplicação
// -----------------------------------------------------------------------------
// Utilitário de busca simples (case-insensitive, múltiplos campos)
const searchUtils = {
    normalize: (s) => (s || '').toString().toLowerCase(),
    matchesAssay: (assay, query) => {
        const q = searchUtils.normalize(query);
        if (!q) return false;
        const hay = [
            assay.protocol,
            assay.orcamento,
            assay.assayManufacturer,
            assay.model,
            assay.tensao,
            assay.nominalLoad?.toString(),
            assay.status,
            assay.type,
            assay.observacoes,
        ].map(searchUtils.normalize).join(' | ');
        return hay.includes(q);
    },
    matchesCalibration: (calib, query) => {
        const q = searchUtils.normalize(query);
        if (!q) return false;
        const hay = [
            calib.protocol,
            calib.notes,
            calib.affectedTerminals?.toString(),
        ].map(searchUtils.normalize).join(' | ');
        return hay.includes(q);
    }
};

// Listener do input de busca
document.addEventListener('DOMContentLoaded', () => {
    if (DOM.ganttGlobalSearchInput) {
        DOM.ganttGlobalSearchInput.addEventListener('input', (e) => {
            state.ganttSearchQuery = e.target.value || '';
            renderers.renderGanttChart();
        });
    }
});
const undoManager = {
    saveState: () => {
        const stateToSave = {
            inventory: JSON.parse(JSON.stringify(state.inventory)),
            historicalAssays: JSON.parse(JSON.stringify(state.historicalAssays)),
            scheduledAssays: JSON.parse(JSON.stringify(state.scheduledAssays)),
            safetyScheduledAssays: JSON.parse(JSON.stringify(state.safetyScheduledAssays)), // <-- ADICIONADO
            holidays: JSON.parse(JSON.stringify(state.holidays)),
            calibrations: JSON.parse(JSON.stringify(state.calibrations)),
            settings: JSON.parse(JSON.stringify(state.settings)),
            efficiencyCategories: JSON.parse(JSON.stringify(state.efficiencyCategories)), // <-- ADICIONADO
            safetyCategories: JSON.parse(JSON.stringify(state.safetyCategories)) // <-- ADICIONADO
        };
        state.undoStack.push(stateToSave);
        if (state.undoStack.length > state.maxUndoHistory) {
            state.undoStack.shift();
        }
    },

    undo: () => {
    if (state.undoStack.length > 0) {
        const previousState = state.undoStack.pop();
        
        // Restaura cada parte do estado a partir da cópia salva.
        state.inventory = previousState.inventory;
        state.historicalAssays = previousState.historicalAssays;
        state.scheduledAssays = previousState.scheduledAssays;
        state.safetyScheduledAssays = previousState.safetyScheduledAssays;
        state.holidays = previousState.holidays;
        state.calibrations = previousState.calibrations;
        state.settings = previousState.settings;
        state.efficiencyCategories = previousState.efficiencyCategories;
        state.safetyCategories = previousState.safetyCategories;
        
        // Redesenha toda a interface com o estado restaurado.
        renderers.renderAll();
        
        utils.showToast("Ação desfeita com sucesso.");

    } else {
        utils.showToast("Nada para desfazer.", true);
    }
}
};
/**
 * Funções utilitárias para tarefas comuns, como exibição de UI e manipulação de datas.
 */
const utils = {
    /** Exibe o spinner de carregamento. */
    showLoading: () => DOM.loadingSpinner?.classList.remove('hidden'),
    /** Esconde o spinner de carregamento. */
    hideLoading: () => DOM.loadingSpinner?.classList.add('hidden'),

    /**
     * Exibe um toast de notificação na tela usando o sistema unificado.
     * @param {string} message - A mensagem a ser exibida.
     * @param {boolean} [isError=false] - Se true, a mensagem é um erro e tem cor vermelha.
     */
    showToast: (message, isError = false) => {
        // Bloqueia notificações para usuários visualizadores
        if (state.currentUser && state.currentUser.permissions.viewOnly) {
            return;
        }
        
        // Usa o sistema de notificações unificado para evitar sobreposição
        const type = isError ? 'error' : 'success';
        const title = isError ? 'Erro' : 'Sucesso';
        
        notificationSystem.send(title, message, type, {
            autoClose: true,
            autoCloseDelay: 3000
        });
    },

    /**
     * Abre um modal com o título e conteúdo especificados.
     * @param {string} title - O título do modal.
     * @param {string} contentHTML - O conteúdo HTML do modal.
     * @param {Function} [onOpen] - Uma função de callback para ser executada quando o modal for aberto.
     */
    openModal: (title, contentHTML, onOpen) => {
        if (!DOM.modal) return;
        const modalContent = DOM.modal.querySelector('.modal-content');
        const modalTitle = DOM.modal.querySelector('.modal-title');
        if (modalTitle) modalTitle.textContent = title;
        if (modalContent) {
            modalContent.innerHTML = contentHTML;
            // Força as cores corretas no conteúdo do modal
            modalContent.style.color = '#1f2937'; // text-gray-800
        }
        DOM.modal.classList.remove('hidden');
        DOM.modal.classList.add('visible');
        
        // Adiciona a classe show para animações
        setTimeout(() => {
            if (modalContent) {
                modalContent.classList.add('show');
            }
        }, 10);
        
        if (onOpen) onOpen();
    },

    /** Fecha o modal atualmente aberto. */
    closeModal: () => {
        if (!DOM.modal) return;
        const modalContent = DOM.modal.querySelector('.modal-content');
        
        // Remove a classe show
        if (modalContent) {
            modalContent.classList.remove('show');
        }
        
        // Fecha o modal imediatamente sem animação
        DOM.modal.classList.add('hidden');
        DOM.modal.classList.remove('visible');
        
        state.selectedAssayId = null;
        state.selectedReagentId = null;
    },

    /**
     * Formata uma string de data (YYYY-MM-DD) para o formato 'pt-BR'.
     * @param {string} dateStr - A string de data.
     * @returns {string} A data formatada.
     */
    formatDate: (dateStr) => {
        const date = new Date(dateStr + 'T00:00:00');
        return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString('pt-BR');
    },

    /**
     * Analisa uma string de data (YYYY-MM-DD) e retorna um objeto Date.
     * @param {string} dateStr - A string de data.
     * @returns {Date} O objeto Date.
     */
    parseDate: (dateStr) => {
        if (!dateStr) return new Date();
        
        // Verificar se é formato brasileiro (DD/MM/YYYY)
        if (dateStr.includes('/')) {
            const [day, month, year] = dateStr.split('/');
            return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`);
        }
        
        // Formato ISO (YYYY-MM-DD)
        return new Date(dateStr + 'T00:00:00');
    },

    /**
     * Verifica se uma data é um feriado.
     * @param {string} dateStr - A string de data a ser verificada.
     * @returns {boolean} True se a data for um feriado, caso contrário, false.
     */
    isHoliday: (dateStr) => {
        const checkDate = utils.parseDate(dateStr);
        for (const holiday of state.holidays) {
            const startDate = utils.parseDate(holiday.startDate);
            const endDate = utils.parseDate(holiday.endDate);
            if (checkDate >= startDate && checkDate <= endDate) {
                return true;
            }
        }
        return false;
    },
    stripLinkTags: (text) => {
        const s = String(text || '');
        return s.replace(/\s*\[link_(?:safety|efficiency):\d+\]\s*/g, '').trim();
    },
    extractLinkTags: (text) => {
        const s = String(text || '');
        const tags = s.match(/\[link_(?:safety|efficiency):\d+\]/g);
        return tags || [];
    },
    mergeObservacoesWithLinkTags: (originalObs, newText) => {
        const clean = utils.stripLinkTags(newText);
        const tags = utils.extractLinkTags(originalObs);
        return tags.length > 0 ? `${clean} ${tags.join(' ')}`.trim() : clean;
    }
};

// Retorna o evento do cronograma que cobre a data
function getEventForDate(dateStr) {
    const checkDate = utils.parseDate(dateStr);
    for (const evt of state.events || []) {
        const startDate = utils.parseDate(evt.startDate);
        const endDate = utils.parseDate(evt.endDate);
        if (checkDate >= startDate && checkDate <= endDate) {
            return evt;
        }
    }
    return null;
}
const uiHelpers = {

    updateNotificationBadge: () => {
        const badge = document.getElementById('notification-badge');
        if (!badge) return;

        if (state.unreadNotifications > 0) {
            badge.textContent = state.unreadNotifications > 9 ? '9+' : state.unreadNotifications;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    },

    renderNotificationPanel: () => {
        const list = document.getElementById('notification-list');
        if (!list) return;
        
        const history = notificationSystem.getHistory();
        if (history.length === 0) {
            list.innerHTML = '<li class="p-4 text-sm text-gray-500 text-center">Nenhuma notificação recente.</li>';
            return;
        }

        list.innerHTML = history.map(notif => {
            const icons = { info: '📋', success: '✅', warning: '⚠️', error: '❌' };
            const icon = icons[notif.type] || '🔔';
            
            // MODIFICAÇÃO AQUI: Remove .substring() e adiciona .replace()
            const formattedMessage = notif.message.replace(/\n/g, '<br>');

            return `
                <li class="border-b p-4 hover:bg-gray-50">
                    <div class="flex items-start space-x-4">
                        <span class="text-2xl mt-1">${icon}</span>
                        <div>
                            <p class="font-semibold text-sm text-gray-800">${notif.title}</p>
                            <p class="text-sm text-gray-600 leading-relaxed">${formattedMessage}</p>
                            <p class="text-sm text-gray-400 mt-1">${new Date(notif.timestamp).toLocaleString('pt-BR')}</p>
                        </div>
                    </div>
                </li>
            `;
        }).join('');
    }
};

/**
 * Funções relacionadas à renderização da interface do usuário.
 */
const ui = {
    /**
     * Alterna a visibilidade dos botões de salvar/cancelar do cronograma.
     * @param {boolean} show - True para mostrar, false para esconder.
     */
    toggleScheduleActions: (show) => {
        if (!DOM.scheduleActionsContainer) return;
        if (show) {
            DOM.scheduleActionsContainer.classList.remove('hidden');
            DOM.scheduleActionsContainer.classList.add('flex');
        } else {
            DOM.scheduleActionsContainer.classList.add('hidden');
            DOM.scheduleActionsContainer.classList.remove('flex');
        }
    },
    /**
     * Exibe um modal de confirmação customizado.
     * @param {string} message - A mensagem a ser exibida no modal.
     * @param {Function} onConfirm - A função a ser executada se o utilizador confirmar.
     */
    showConfirmationModal: (message, onConfirm) => {
        const modalContent = document.getElementById('confirmation-modal-content').innerHTML;
        utils.openModal('Confirmação Necessária', modalContent, () => {
            document.getElementById('confirmation-modal-message').textContent = message;

            const confirmBtn = document.getElementById('btn-confirm-action');
            const cancelBtn = document.getElementById('btn-confirm-cancel');

            const confirmAndClose = () => {
                onConfirm(); // Executa a ação de exclusão
                utils.closeModal();
            };

            confirmBtn.addEventListener('click', confirmAndClose);
            cancelBtn.addEventListener('click', () => utils.closeModal());
        });
    },

    /**
     * Cria containers dinâmicos para os ciclos de lotes de ensaios de segurança elétrica (A, B, C).
     * @param {Object} safetyAssay - O ensaio de segurança para o qual os containers serão criados.
     */
    createDynamicLotCycleContainers: (safetyAssay) => {
        const container = document.getElementById('dynamic-lot-cycle-containers');
        if (!container) return;
        container.innerHTML = ''; // Limpa containers existentes
        const reagents = ['Pó Base', 'Perborato', 'TAED', 'Tiras de sujidade'];
        reagents.forEach(reagent => {
            const div = document.createElement('div');
            div.className = 'lote-container mb-4';
            div.innerHTML = `
                <label class="block text-sm font-medium text-gray-700">${reagent}</label>
                <div class="flex items-center space-x-2">
                    <select name="lote" class="flex-1 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                        <option value="">Selecione o lote</option>
                    </select>
                    <input type="number" name="cycles" placeholder="Ciclos" class="w-20 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                </div>
            `;
            container.appendChild(div);
        });
    },

    scrollToTodayInGantt: () => {
    setTimeout(() => {
        const today = new Date();
        
        const todayString = today.getFullYear() + '-' +
                            String(today.getMonth() + 1).padStart(2, '0') + '-' +
                            String(today.getDate()).padStart(2, '0');
        
        const todayCell = DOM.ganttHeaderContainer?.querySelector(
            `.gantt-days-header-row > div[data-date="${todayString}"]`
        );

        // 
        const scrollContainer = DOM.ganttScrollContainer;

        if (todayCell && scrollContainer) {
            
            const scrollTarget = todayCell.offsetLeft - (scrollContainer.clientWidth / 2) + (todayCell.clientWidth / 2);
            
            scrollContainer.scroll({
                left: scrollTarget,
                behavior: 'smooth'
            });
        }
    }, 250); // Aumentado para 250ms por segurança
}
};

/**
 * Sistema de autenticação e controle de acesso
 */
const authSystem = {
    /**
     * Define o usuário atual (usado pelo login automático)
     * @param {object} user - Dados do usuário
     */
    setCurrentUser: (user) => {
        state.currentUser = user;
        state.isLoggedIn = true;
        console.log('👤 Usuário definido:', user);
    },

    /**
     * Realiza logout do usuário atual
     */
    logout: () => {
        state.currentUser = null;
        state.isLoggedIn = false;
        // Recarrega a página para reiniciar o processo de autenticação
        window.location.reload();
    },

    /**
     * Verifica se o usuário atual tem uma permissão específica
     * @param {string} permission - Nome da permissão a verificar
     * @returns {boolean} - True se o usuário tem a permissão
     */
    hasPermission: (permission) => {
        if (!state.currentUser) return false;
        return state.currentUser.permissions[permission] || false;
    },

    /**
     * Atualiza o status da tela de loading
     */
    updateLoadingStatus: (message) => {
        if (DOM.loadingStatus) {
            DOM.loadingStatus.textContent = message;
        }
    },

    /**
     * Esconde a tela de loading
     */
    hideLoadingScreen: () => {
        if (DOM.loadingScreen) {
            DOM.loadingScreen.classList.add('hidden');
        }
    },

    /**
     * Mostra a interface principal
     */
    showMainInterface: () => {
        DOM.mainInterface.classList.remove('hidden');
        // Aplica controle de permissões na interface
        authSystem.applyPermissions();
    },

    /**
     * Esconde a interface principal
     */
    hideMainInterface: () => {
        DOM.mainInterface.classList.add('hidden');
    },

    /**
     * Aplica controle de permissões na interface baseado no usuário logado
     */
    applyPermissions: () => {
        if (!state.currentUser) return;

        const permissions = state.currentUser.permissions;
        const userType = state.currentUser.type;

        // Se é visualizador, desabilita todos os botões de edição
        if (userType === 'visualizador' || permissions.viewOnly) {
            // Desabilita botões de adicionar/editar (exceto botões do modal de cronograma)
            const editButtons = document.querySelectorAll(
                '#btn-open-reagent-modal, #btn-open-assay-modal, .btn-edit, .btn-delete, .btn-add'
            );
            editButtons.forEach(btn => {
                // Permite botões de editar e excluir do modal de cronograma para visualizadores
                if (btn && !btn.classList.contains('btn-edit-gantt-assay') && !btn.classList.contains('btn-delete-gantt-assay')) {
                    btn.style.display = 'none';
                }
            });

            // Esconde botões do cronograma (exceto ensaios de eficiência e segurança para permitir cenários)
            const ganttAddButtons = document.querySelectorAll('#btn-open-add-vacation-modal, #btn-open-add-calibration-modal');
            ganttAddButtons.forEach(btn => {
                if (btn) btn.style.display = 'none';
            });

            // Esconde menu de gerenciar linhas
            const ganttActionsMenu = document.getElementById('gantt-actions-menu');
            if (ganttActionsMenu) {
                ganttActionsMenu.style.display = 'none';
            }

            // Oculta páginas restritas para visualizadores
            const restrictedPages = ['nav-settings', 'nav-inventory', 'nav-assays', 'nav-calibrations', 'nav-forecast'];
            restrictedPages.forEach(navId => {
                const navElement = document.getElementById(navId);
                if (navElement) {
                    navElement.style.display = 'none';
                }
            });

            // Se estiver em uma página restrita, redireciona para dashboard
            const currentPage = document.querySelector('.page:not(.hidden)');
            if (currentPage && ['page-inventory', 'page-assays', 'page-calibrations', 'page-settings'].includes(currentPage.id)) {
                renderers.switchPage('page-dashboard');
            }

            // Esconde botões de ação do cronograma
            const scheduleActions = document.getElementById('schedule-actions-container');
            if (scheduleActions) {
                scheduleActions.style.display = 'none';
            }

            // Drag and drop liberado para visualizadores
        }

        // Para técnicos (eficiência e segurança), permitem agendar férias
        if (userType === 'tecnico_eficiencia' || userType === 'tecnico_seguranca') {
            const ganttAddButtons = document.querySelectorAll('#btn-open-add-vacation-modal');
            ganttAddButtons.forEach(btn => {
                if (btn) btn.style.display = 'flex';
            });
        }

        // Para administrador, garante acesso total aos botões do cronograma
        if (userType === 'administrador') {
            // Os botões de salvar/cancelar só aparecem quando há alterações (controlado por ui.toggleScheduleActions)
            // Apenas garantimos que os botões de adicionar estejam visíveis
            const ganttAddButtons = document.querySelectorAll('#btn-open-add-gantt-assay-modal, #btn-open-add-safety-assay-modal, #btn-open-add-vacation-modal');
            ganttAddButtons.forEach(btn => {
                if (btn) btn.style.display = 'flex'; // Mantém o display flex para preservar o layout
            });
        }

        // Controla acesso às configurações (apenas administrador)
        const settingsNav = document.getElementById('nav-settings');
        if (settingsNav) {
            if (userType === 'administrador') {
                settingsNav.style.display = 'flex'; // Preserva o layout flexbox
            } else {
                settingsNav.style.display = 'none';
            }
        }

        // Controla acesso ao botão de gerar relatório PDF (apenas administrador)
        const pdfReportButton = document.getElementById('btn-generate-pdf-report');
        if (pdfReportButton) {
            if (userType === 'administrador') {
                pdfReportButton.style.display = 'flex'; // Preserva o layout flexbox
            } else {
                pdfReportButton.style.display = 'none';
            }
        }
        
        // Controla acesso ao item de menu de exclusão em massa (apenas administrador)
        const bulkDeleteNavItem = document.getElementById('nav-bulk-delete-item');
        if (bulkDeleteNavItem) {
            if (userType === 'administrador') {
                bulkDeleteNavItem.style.display = 'block';
            } else {
                bulkDeleteNavItem.style.display = 'none';
            }
        }

        // Para técnico eficiência, habilita botões de adicionar ensaio e insumo
        if (userType === 'tecnico_eficiencia') {
            const reagentButton = document.getElementById('btn-open-reagent-modal');
            const assayButton = document.getElementById('btn-open-assay-modal');
            if (reagentButton) reagentButton.style.display = 'flex';
            if (assayButton) assayButton.style.display = 'flex';
        }

        // Se não pode adicionar/editar insumos (técnico segurança)
        if (!permissions.addEditSupplies) {
            const reagentButton = document.getElementById('btn-open-reagent-modal');
            if (reagentButton) {
                reagentButton.style.display = 'none';
            }
        }

        // Habilita drag and drop para todos os tipos de usuário
        authSystem.enableDragAndDrop();

        // Aplica permissões específicas para elementos dinâmicos
        authSystem.applyDynamicPermissions();
    },

    /**
     * Habilita funcionalidade de drag and drop
     */
    enableDragAndDrop: () => {
        // Adiciona event listeners de drag and drop
        DOM.ganttGridContainer?.addEventListener('pointerdown', dragHandlers.handleDragStart);
        document.addEventListener('pointermove', dragHandlers.handleDrag);
        document.addEventListener('pointerup', dragHandlers.handleDragEnd);
        
        // Adiciona event listener para clique direito (duplicar elemento)
        DOM.ganttGridContainer?.addEventListener('contextmenu', dragHandlers.handleRightClick);
        
        // Remove estilos que impedem arrastar
        const draggableElements = document.querySelectorAll('.gantt-assay, .gantt-calibration');
        draggableElements.forEach(element => {
            element.style.cursor = 'move';
            element.style.pointerEvents = 'auto';
        });
    },

    /**
     * Desabilita funcionalidade de drag and drop
     */
    disableDragAndDrop: () => {
        // Remove event listeners de drag and drop
        DOM.ganttGridContainer?.removeEventListener('pointerdown', dragHandlers.handleDragStart);
        document.removeEventListener('pointermove', dragHandlers.handleDrag);
        document.removeEventListener('pointerup', dragHandlers.handleDragEnd);
        
        // Remove event listener de clique direito
        DOM.ganttGridContainer?.removeEventListener('contextmenu', dragHandlers.handleRightClick);
        
        // Adiciona estilo para indicar que não é arrastável
        const draggableElements = document.querySelectorAll('.gantt-assay, .gantt-calibration');
        draggableElements.forEach(element => {
            element.style.cursor = 'default';
            element.style.pointerEvents = 'none';
        });
    },

    /**
     * Aplica permissões em elementos criados dinamicamente
     */
    applyDynamicPermissions: () => {
        if (!state.currentUser) return;

        const permissions = state.currentUser.permissions;
        const userType = state.currentUser.type;

        // Para técnico segurança, esconde TODOS os botões de edição
        if (userType === 'tecnico_seguranca') {
            const allActionButtons = document.querySelectorAll('.btn-edit, .btn-delete, .btn-add, .btn-start, .btn-finish');
            allActionButtons.forEach(btn => {
                btn.style.display = 'none';
            });

            // Esconde apenas botão de calibração para segurança
            const securityRestrictedButtons = document.querySelectorAll('#btn-open-add-calibration-modal');
            securityRestrictedButtons.forEach(btn => {
                if (btn) btn.style.display = 'none';
            });
        }

        // Para técnico eficiência, esconde apenas botão de calibração
        if (userType === 'tecnico_eficiencia') {
            const efficiencyRestrictedButtons = document.querySelectorAll('#btn-open-add-calibration-modal');
            efficiencyRestrictedButtons.forEach(btn => {
                if (btn) btn.style.display = 'none';
            });
        }

        // Os botões de ação no inventário e histórico são controlados pelas funções canPerformAction
        // nas respectivas funções de renderização (renderInventoryTable e createAssaysTableHTML)

        // Se não pode editar histórico, esconde botões de edição em ensaios concluídos
        if (!permissions.editHistory) {
            const historyEditButtons = document.querySelectorAll('.historical-assay .btn-edit, .historical-assay .btn-delete');
            historyEditButtons.forEach(btn => {
                btn.style.display = 'none';
            });
        }

        // Botões do cronograma liberados para técnicos
        // Os técnicos agora podem editar e excluir ensaios e calibrações no cronograma
    },

    /**
     * Verifica se o usuário pode realizar uma ação específica
     * @param {string} action - A ação a ser verificada
     * @param {Object} context - Contexto adicional (ex: status do ensaio)
     * @returns {boolean} - True se pode realizar a ação
     */
    canPerformAction: (action, context = {}) => {
        if (!state.currentUser) return false;

        const permissions = state.currentUser.permissions;
        const userType = state.currentUser.type;

        switch (action) {
            case 'editHistoricalAssay':
                // Administrador e técnico eficiência podem editar histórico
                return (userType === 'administrador' || userType === 'tecnico_eficiencia') && permissions.editHistory;
            case 'addEditSupplies':
                // Administrador e técnico eficiência podem adicionar/editar insumos
                return userType === 'administrador' || userType === 'tecnico_eficiencia';
            case 'accessSettings':
                // Apenas administrador pode acessar configurações
                return permissions.accessSettings;
            case 'editSchedule':
                // Apenas administrador pode editar cronograma
                return userType === 'administrador';
            case 'dragAndDrop':
                // Apenas administrador pode usar drag and drop
                return userType === 'administrador';
            case 'deleteAssay':
                // Técnico segurança não pode deletar nada
                if (userType === 'tecnico_seguranca') return false;
                // Para ensaios concluídos, apenas administrador
                if (context.status === 'concluido' || context.status === 'relatorio') {
                    return userType === 'administrador';
                }
                // Para outros ensaios, administrador e técnico eficiência
                return userType === 'administrador' || userType === 'tecnico_eficiencia';
            case 'addAssay':
                // Administrador e técnico eficiência podem adicionar ensaios
                return userType === 'administrador' || userType === 'tecnico_eficiencia';
            
            default:
                // Técnico segurança só pode visualizar
                return userType !== 'tecnico_seguranca';
        }
    },



    /**
     * Inicializa o sistema de autenticação
     */
    init: () => {
        // Mostra tela de loading na inicialização
        if (DOM.loadingScreen) {
            DOM.loadingScreen.classList.remove('hidden');
        }
        
        // Atualiza status inicial
        authSystem.updateLoadingStatus('Iniciando sistema...');
        
        
        // Solicita dados do backend após um pequeno delay
        setTimeout(() => {
            authSystem.updateLoadingStatus('Carregando dados...');
    window.vscode?.postMessage({ command: 'webviewReady' });
        }, 500);
    }
};

/**
 * Funções para gerenciamento de acesso por senha.
 */
const accessControl = {
    /**
     * Abre o modal de senha com um contexto específico.
     * @param {string} context - O contexto do pedido de senha ('saveSchedule' ou 'accessSettings').
     */
    openPasswordModal: (context) => {
        // Verifica se o usuário tem permissão antes de abrir o modal
        if (context === 'accessSettings' && !authSystem.hasPermission('accessSettings')) {
            utils.showToast('Você não tem permissão para acessar as configurações.', true);
            return;
        }
        
        if (context === 'saveSchedule' && authSystem.hasPermission('viewOnly')) {
            utils.showToast('Você não tem permissão para editar o cronograma.', true);
            return;
        }
        
        if (!DOM.passwordModal) return;
        state.passwordContext = context;
        const titleEl = DOM.passwordModal.querySelector('h2');
        const descEl = DOM.passwordModal.querySelector('p');
        if (context === 'accessSettings') {
            if (titleEl) titleEl.textContent = 'Aceder às Configurações';
            if (descEl) descEl.textContent = 'Por favor, insira a senha para aceder a esta página.';
        } else {
            if (titleEl) titleEl.textContent = 'Confirmar Alterações';
            if (descEl) descEl.textContent = 'Por favor, insira a senha para guardar as alterações no cronograma.';
        }
        DOM.passwordInput.value = '';
        DOM.passwordErrorMessage.textContent = '';
        DOM.passwordModal.classList.remove('hidden');
        DOM.passwordModal.classList.add('visible');
        DOM.passwordInput.focus();
    },

    /** Fecha o modal de senha. */
    closePasswordModal: () => {
        if (!DOM.passwordModal) return;
        DOM.passwordModal.classList.add('hidden');
        DOM.passwordModal.classList.remove('visible');
        state.passwordContext = null;
    },

    /** Lida com o envio do formulário de senha. */
    handlePasswordSubmit: () => {
        const enteredPassword = DOM.passwordInput.value;
        const correctPassword = state.settings.schedulePassword || 'admin';
        if (enteredPassword === correctPassword) {
            if (state.passwordContext === 'saveSchedule') {
                dataHandlers.saveScheduleData();
                state.originalScheduledAssays = JSON.parse(JSON.stringify(state.scheduledAssays));
                state.originalSafetyScheduledAssays = JSON.parse(JSON.stringify(state.safetyScheduledAssays)); // Salva o estado de segurança
                state.hasUnsavedChanges = false;
                ui.toggleScheduleActions(false);
                utils.showToast("Alterações guardadas com sucesso!");
            } else if (state.passwordContext === 'accessSettings') {
                state.isSettingsUnlocked = true;
                renderers.switchPage('page-settings');
            }
            accessControl.closePasswordModal();
        } else {
            if (DOM.passwordErrorMessage) DOM.passwordErrorMessage.textContent = 'Senha incorreta.';
            setTimeout(() => {
                if (DOM.passwordErrorMessage) DOM.passwordErrorMessage.textContent = '';
            }, 2000);
        }
    }
};

/**
 * Função para obter o nome do terminal baseado no setup
 */
const getTerminalName = (setup) => {
    if (!setup) return 'N/A';
    
    // Procura nas categorias de eficiência (números)
    const efficiencyCategory = state.efficiencyCategories.find(cat => cat.id === setup);
    if (efficiencyCategory) {
        return efficiencyCategory.name;
    }
    
    // Procura nas categorias de segurança (letras)
    const safetyCategory = state.safetyCategories.find(cat => cat.id === setup);
    if (safetyCategory) {
        return safetyCategory.name;
    }
    
    // Se não encontrar, retorna o valor original
    return `Terminal ${setup}`;
};

/**
 * Funções para cálculos de consumo e previsões.
 */
const calculations = {
    /**
     * Calcula o número de tiras de sujidade com base na carga nominal.
     * @param {number} nominalLoad - A carga nominal em kg.
     * @returns {number} O número de tiras.
     */
    calculateTiras: (nominalLoad) => {
        if (nominalLoad <= 2.4) return 2;
        if (nominalLoad <= 3.4) return 3;
        if (nominalLoad <= 4.4) return 4;
        if (nominalLoad <= 5.4) return 5;
        if (nominalLoad <= 6.4) return 6;
        if (nominalLoad <= 7.4) return 7;
        return 8;
    },

    /**
     * Calcula o consumo de reagentes com base na carga nominal e ciclos.
     * @param {number} nominalLoad - Carga nominal em kg.
     * @param {number} cycles - Número de ciclos do ensaio.
     * @returns {{poBase: number, perborato: number, taed: number, tiras: number}} O consumo de cada reagente.
     */
    calculateConsumption: (nominalLoad, cycles) => {
        const base = (16 * nominalLoad + 54) * cycles;
        const tiras = Math.ceil(calculations.calculateTiras(nominalLoad) * cycles);
        return {
            poBase: base * 0.77,
            perborato: base * 0.20,
            taed: base * 0.03,
            tiras: tiras,
        };
    },

    /**
     * Calcula o número de ensaios completos que podem ser realizados com o estoque atual.
     * A lógica assume que um ensaio "padrão" usa 13kg de carga e 12 ciclos.
     * @returns {number} O número de ensaios possíveis.
     */
    calculatePossibleAssays: () => {
    const consumptionForOneAssay = calculations.calculateConsumption(13, 12);
    const getStock = (manufacturer, reagent) => {
        return state.inventory
            .filter(i => i.manufacturer === manufacturer && i.reagent === reagent)
            .reduce((sum, i) => sum + i.quantity, 0);
    };

    const poBaseSwissatest = getStock('Swissatest', 'Pó Base');
    const taedSwissatest = getStock('Swissatest', 'TAED');
    const tirasSwissatest = getStock('Swissatest', 'Tiras de sujidade');
    const perboratoMHC = getStock('MHC', 'Perborato');

    const possibilities = [
        { reagent: 'Pó Base', count: consumptionForOneAssay.poBase > 0 ? poBaseSwissatest / consumptionForOneAssay.poBase : Infinity },
        { reagent: 'TAED', count: consumptionForOneAssay.taed > 0 ? taedSwissatest / consumptionForOneAssay.taed : Infinity },
        { reagent: 'Tiras de sujidade', count: consumptionForOneAssay.tiras > 0 ? tirasSwissatest / consumptionForOneAssay.tiras : Infinity },
        { reagent: 'Perborato', count: consumptionForOneAssay.perborato > 0 ? perboratoMHC / consumptionForOneAssay.perborato : Infinity }
    ];

    if (possibilities.length === 0) {
        return { count: 0, limitingReagent: 'Nenhum' };
    }

    // Encontra o reagente com o menor número de ensaios possíveis
    const limitingFactor = possibilities.reduce((min, p) => p.count < min.count ? p : min, possibilities[0]);

    const finalCount = Math.floor(limitingFactor.count);

    return {
        count: isFinite(finalCount) ? finalCount : 0,
        limitingReagent: isFinite(finalCount) && finalCount > 0 ? limitingFactor.reagent : 'Nenhum'
    };
}
}

/**
 * Funções auxiliares para o dashboard.
 */
const dashboardUtils = {
    /**
     * Retorna os ensaios agendados para hoje.
     * @returns {Array} A lista de ensaios de hoje.
     */
    getTodayAssays: () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Apenas ensaios de eficiência (scheduledAssays) - ensaios de segurança ficam limitados ao cronograma
        // Excluir ensaios com status "pendente", férias e calibração
        return state.scheduledAssays.filter(assay => {
            const startDate = utils.parseDate(assay.startDate);
            const endDate = utils.parseDate(assay.endDate);
            const isToday = today >= startDate && today <= endDate;
            const isNotPending = assay.status && assay.status.toLowerCase() !== 'pendente';
            const isNotVacation = assay.type !== 'férias';
            const isNotCalibration = !assay.type || (!assay.type.includes('calibracao') && assay.status.toLowerCase() !== 'calibração');
            
            return isToday && isNotPending && isNotVacation && isNotCalibration;
        }).sort((a, b) => utils.parseDate(a.startDate) - utils.parseDate(b.startDate));
    },
    /**
     * Retorna os ensaios agendados com um status específico.
     * @param {string} status - O status a ser filtrado.
     * @returns {Array} A lista de ensaios com o status.
     */
    getAssaysByStatus: (status) => {
        // Apenas ensaios de eficiência (scheduledAssays) - ensaios de segurança ficam limitados ao cronograma
        return state.scheduledAssays.filter(assay => assay.status.toLowerCase() === status.toLowerCase());
    },
    /**
     * Retorna os próximos ensaios dentro de um número de dias.
     * @param {number} days - Número de dias para a previsão.
     * @returns {Array} A lista de ensaios próximos.
     */
    getUpcomingAssays: (days) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setDate(today.getDate() + days);

    // Função de parsing robusta para datas
    const parseDate = (dateStr) => {
        if (!dateStr) return null;
        
        // Se já for objeto Date
        if (dateStr instanceof Date) return dateStr;
        
        // Tenta diferentes formatos de data
        try {
            // Formato ISO (YYYY-MM-DD)
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                return new Date(dateStr + 'T00:00:00');
            }
            
            // Formato BR (DD/MM/YYYY)
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
                const [day, month, year] = dateStr.split('/');
                return new Date(`${year}-${month}-${day}T00:00:00`);
            }
            
            // Último recurso: tentar o parser nativo
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) return parsed;
            
            return null;
        } catch (error) {
            console.error("Erro ao parsear data:", dateStr, error);
            return null;
        }
    };
    // Apenas ensaios de eficiência (scheduledAssays) - ensaios de segurança ficam limitados ao cronograma
    // Filtra e mapeia os ensaios
    const upcomingAssays = state.scheduledAssays
        .map(assay => {
            const parsedDate = parseDate(assay.startDate);
            return {
                ...assay,
                parsedDate: parsedDate,
                isValidDate: parsedDate && !isNaN(parsedDate.getTime())
            };
        })
        .filter(assay => {
            // Filtra apenas ensaios com datas válidas e dentro do período
            if (!assay.isValidDate) return false;
            
            // CONDIÇÕES ORIGINAIS E NOVAS COMBINADAS
            const isWithinDateRange = assay.parsedDate >= today && assay.parsedDate <= endDate;
            const isNotPending = assay.status.toLowerCase() !== 'pendente';
            const isAssignedToTerminal = assay.setup != null; // Garante que o ensaio tem um terminal definido
            const isNotVacation = assay.type !== 'férias';
            const isNotCalibration = !assay.type || (!assay.type.includes('calibracao') && assay.status.toLowerCase() !== 'calibração');

            return isWithinDateRange && isNotPending && isAssignedToTerminal && isNotVacation && isNotCalibration;
        })
        .sort((a, b) => a.parsedDate - b.parsedDate);

    return upcomingAssays;
},
};


/**
 * Funções de renderização que atualizam a interface do usuário.
 */
const renderers = {
    /** Renderiza todas as partes da interface que dependem do estado. */
    renderAll: () => {
        renderers.ganttInitialRenderDone = false;
        renderers.renderInventoryTable();
        renderers.populateManufacturerFilter();
        renderers.renderAssaysTables('dashboard');
        renderers.renderAssaysTables('assays');
        renderers.renderDashboard();
        renderers.checkStockLevel();
        renderers.populateSettingsForm();
        renderers.renderGanttChart();
        renderers.renderHolidaysList();
        renderers.renderCalibrationsTable();
        forecastSystem.renderAll();
        
        // Aplica permissões após renderizar todos os elementos
        if (state.isLoggedIn) {
            authSystem.applyPermissions();
        }
    },

    populateYearFilter: () => {
        const yearFilterSelect = document.getElementById('dashboard-year-filter');
        if (!yearFilterSelect) return;

        // Encontra todos os anos únicos nos ensaios históricos
        const years = new Set(
            state.historicalAssays.map(assay => {
                try {
                    return new Date(assay.startDate + 'T00:00:00').getFullYear();
                } catch (e) {
                    return null;
                }
            }).filter(year => year) // Filtra nulos ou inválidos
        );

        // Ordena os anos (mais recente primeiro)
        const sortedYears = Array.from(years).sort((a, b) => b - a);

        // Limpa opções antigas e adiciona as novas
        yearFilterSelect.innerHTML = '';
        
        // Adiciona a opção "Todos os Anos"
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'Todos os Anos';
        yearFilterSelect.appendChild(allOption);

        // Adiciona cada ano como uma opção
        sortedYears.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearFilterSelect.appendChild(option);
        });

        // Seleciona o ano mais recente ou "Todos"
        yearFilterSelect.value = sortedYears[0] ? sortedYears[0] : 'all';
    },

    /** Renderiza a tabela de inventário com base no filtro. */
    renderInventoryTable: () => {
        const tbody = document.getElementById('inventory-table-body');
        const filterText = document.getElementById('filter-inventory')?.value.toLowerCase() || '';
        if (!tbody) return;
        const filteredInventory = state.inventory.filter(item =>
            item.reagent.toLowerCase().includes(filterText) ||
            item.manufacturer.toLowerCase().includes(filterText) ||
            item.lot.toLowerCase().includes(filterText)
        );
        tbody.innerHTML = '';
        filteredInventory.sort((a, b) => a.reagent.localeCompare(b.reagent)).forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-gray-200 hover:bg-gray-100';
            const unit = item.reagent === 'Tiras de sujidade' ? 'un' : 'g';
            tr.innerHTML = `
                <td class="py-3 px-4">${item.reagent}</td>
                <td class="py-3 px-4">${item.manufacturer}</td>
                <td class="py-3 px-4">${item.lot}</td>
                <td class="py-3 px-4">${item.quantity.toLocaleString('pt-BR')} ${unit}</td>
                <td class="py-3 px-4">${utils.formatDate(item.validity)}</td>
                <td class="py-3 px-4 flex items-center space-x-2">
                    <button class="btn-edit-reagent text-blue-500 hover:text-blue-700" data-id="${item.id}" title="Editar Insumo">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="btn-delete-reagent text-red-500 hover:text-red-700" data-id="${item.id}" title="Excluir Insumo">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    /**
     * Cria o HTML para a tabela de ensaios.
     * @param {Array} filteredAssays - A lista de ensaios a serem exibidos.
     * @returns {string} O HTML da tabela.
     */
    createAssaysTableHTML: (filteredAssays) => {
        let tableHTML = `
            <table class="min-w-full bg-white">
                <thead class="bg-gray-800 text-white sticky top-0 z-10">
                    <tr>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Protocolo</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Orçamento</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Fabricante</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Modelo</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Tensão</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Data Início</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Data Fim</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Carga (kg)</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Ciclos</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Tiras (un)</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Pó Base (g)</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Perborato (g)</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">TAED (g)</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Lote Pó Base</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Lote Perborato</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Lote TAED</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Lote Tiras</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Relatório</th>
                        <th class="text-left py-3 px-4 uppercase font-semibold text-sm whitespace-nowrap">Ações</th>
                    </tr>
                </thead>
                <tbody class="text-gray-700">
        `;
        filteredAssays.forEach(assay => {
            let consumption = { poBase: 0, perborato: 0, taed: 0, tiras: 0 };
            let displayCycles = assay.cycles; // Valor padrão
            
            if (assay.lots && !Array.isArray(assay.lots.poBase)) {
                // Lógica para dados antigos (consumo calculado)
                consumption = calculations.calculateConsumption(assay.nominalLoad, assay.cycles);
            } else if (assay.lots && Array.isArray(assay.lots.poBase)) {
                // Nova lógica para múltiplos lotes
                consumption.poBase = assay.lots.poBase.reduce((sum, l) => sum + (16 * assay.nominalLoad + 54) * l.cycles * 0.77, 0);
                consumption.perborato = assay.lots.perborato.reduce((sum, l) => sum + (16 * assay.nominalLoad + 54) * l.cycles * 0.20, 0);
                consumption.taed = assay.lots.taed.reduce((sum, l) => sum + (16 * assay.nominalLoad + 54) * l.cycles * 0.03, 0);
                consumption.tiras = assay.lots.tiras.reduce((sum, l) => sum + calculations.calculateTiras(assay.nominalLoad) * l.cycles, 0);
                
                // Calcular média dos ciclos dos lotes
                const allLots = [...(assay.lots.poBase || []), ...(assay.lots.perborato || []), ...(assay.lots.taed || []), ...(assay.lots.tiras || [])];
                if (allLots.length > 0) {
                    const totalCycles = allLots.reduce((sum, lot) => sum + (lot.cycles || 0), 0);
                    displayCycles = Math.round(totalCycles / 4);
                }
            } else {
                // Fallback
                consumption = { poBase: 0, perborato: 0, taed: 0, tiras: 0 };
            }

            const startDateFormatted = utils.formatDate(assay.startDate);
            const endDateFormatted = utils.formatDate(assay.endDate);

            // Geração de HTML para os lotes
            const lotHTML = (reagentName) => {
                if (!assay.lots || !assay.lots[reagentName]) return 'N/A';
                if (Array.isArray(assay.lots[reagentName])) {
                    // Remove duplicatas baseado no lote e ciclos
                    const uniqueLots = assay.lots[reagentName].filter((lot, index, self) => 
                        index === self.findIndex(l => l.lot === lot.lot && l.cycles === lot.cycles)
                    );
                    return uniqueLots.map(l => `${l.lot} (${l.cycles}c)`).join(', ');
                }
                return assay.lots[reagentName]; // Para compatibilidade com dados antigos
            };
            
            const hasReport = !!assay.report && assay.report.trim() !== '' && assay.report.trim().toLowerCase() !== 'pendente';
            const reportButtonHTML = hasReport ?
                `<button class="btn-edit-report bg-gray-500 hover:bg-gray-600 text-white font-bold py-1 px-2 rounded text-xs whitespace-nowrap" data-id="${assay.id}" title="Editar Relatório">Editar Relatório</button>` :
                `<button class="btn-open-report-modal bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-1 px-2 rounded text-xs whitespace-nowrap" data-id="${assay.id}" title="Adicionar Relatório">Adicionar Relatório</button>`;
            
            tableHTML += `
                <tr class="border-b border-gray-200 hover:bg-gray-100">
                    <td class="py-3 px-4">${assay.protocol}</td>
                    <td class="py-2 px-4 border-b-2 text-center">${assay.orcamento}</td>
                    <td class="py-3 px-4">${assay.assayManufacturer}</td>
                    <td class="py-3 px-4">${assay.model}</td>
                    <td class="py-3 px-4">${assay.tensao}</td>
                    <td class="py-3 px-4">${startDateFormatted}</td>
                    <td class="py-3 px-4">${endDateFormatted}</td>
                    <td class="py-3 px-4">${assay.nominalLoad}</td>
                    <td class="py-3 px-4">${displayCycles}</td>
                    <td class="py-3 px-4">${consumption.tiras.toFixed(0)}</td>
                    <td class="py-3 px-4">${consumption.poBase.toFixed(2)}</td>
                    <td class="py-3 px-4">${consumption.perborato.toFixed(2)}</td>
                    <td class="py-3 px-4">${consumption.taed.toFixed(2)}</td>
                    <td class="py-3 px-4">${lotHTML('poBase')}</td>
                    <td class="py-3 px-4">${lotHTML('perborato')}</td>
                    <td class="py-3 px-4">${lotHTML('taed')}</td>
                    <td class="py-3 px-4">${lotHTML('tiras')}</td>
                    <td class="py-3 px-4">${assay.report ? assay.report : '<span class="text-red-500">Pendente</span>'}</td>
                    <td class="py-3 px-4 flex items-center space-x-2">
                        ${reportButtonHTML}
                        <button class="btn-edit-assay text-blue-500 hover:text-blue-700" data-id="${assay.id}" title="Editar Ensaio">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="btn-delete-assay text-red-500 hover:text-red-700" data-id="${assay.id}" title="Excluir Ensaio">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </td>
                </tr>
            `;
        });
        tableHTML += `</tbody></table></div>`;
        return tableHTML;
    },

    /**
     * Renderiza as tabelas de ensaios com base nos filtros e no prefixo da página.
     * @param {string} pagePrefix - O prefixo do ID da página ('dashboard' ou 'assays').
     */
    renderAssaysTables: (pagePrefix) => {
        if (!pagePrefix) {
            console.error("A função renderAssaysTables foi chamada sem um pagePrefix.");
            return;
        }

        const protocolFilterEl = document.getElementById(`filter-protocol-${pagePrefix}`);
        const modelFilterEl = document.getElementById(`filter-model-${pagePrefix}`);
        const manufacturerFilterEl = document.getElementById(`filter-manufacturer-${pagePrefix}`);
        const budgetFilterEl = document.getElementById(`filter-orcamento-${pagePrefix}`); // Use 'orcamento' aqui também

        const protocolFilter = protocolFilterEl ? protocolFilterEl.value.toLowerCase() : '';
        const modelFilter = modelFilterEl ? modelFilterEl.value.toLowerCase() : '';
        const manufacturerFilter = manufacturerFilterEl ? manufacturerFilterEl.value.toLowerCase() : '';
        const budgetFilter = budgetFilterEl ? budgetFilterEl.value.toLowerCase() : '';

        const filteredAssays = state.historicalAssays.filter(assay => {
            const protocolMatch = assay.protocol?.toLowerCase().includes(protocolFilter);
            const modelMatch = assay.model?.toLowerCase().includes(modelFilter);
            const manufacturerMatch = (manufacturerFilter === '' || assay.assayManufacturer?.toLowerCase() === manufacturerFilter);
            const assayOrcamento = assay.orcamento || '';
            const budgetMatch = (budgetFilter === '' || assayOrcamento.toLowerCase().includes(budgetFilter)); // Usa 'orcamento' para a busca
            
            return protocolMatch && modelMatch && manufacturerMatch && budgetMatch;
        });

        const tableHTML = renderers.createAssaysTableHTML(filteredAssays);
        
        let tableContainer;
        if (pagePrefix === 'dashboard') {
            tableContainer = document.getElementById('dashboard-assays-table');
        } else if (pagePrefix === 'assays') {
            tableContainer = document.getElementById('assays-page-table');
        }

        if (tableContainer) {
            tableContainer.innerHTML = tableHTML;
        }
    },

    /** Renderiza a lista de feriados na página de configurações. */
    renderHolidaysList: () => {
        const listElement = document.getElementById('holidays-list');
        if (!listElement) return;
        listElement.innerHTML = '';
        const sortedHolidays = [...state.holidays].sort((a, b) => utils.parseDate(a.startDate) - utils.parseDate(b.startDate));
        if (sortedHolidays.length > 0) {
            sortedHolidays.forEach(holiday => {
                const li = document.createElement('li');
                li.className = 'flex justify-between items-center bg-gray-100 p-2 rounded';
                const dateText = holiday.startDate === holiday.endDate ?
                    utils.formatDate(holiday.startDate) :
                    `${utils.formatDate(holiday.startDate)} a ${utils.formatDate(holiday.endDate)}`;
                li.innerHTML = `
                    <div>
                        <span class="font-semibold">${holiday.name}</span>
                        <span class="text-sm text-gray-600 ml-2">(${dateText})</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="btn-edit-holiday text-blue-500 hover:text-blue-700" data-id="${holiday.id}" title="Editar">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="btn-remove-holiday text-red-500 hover:text-red-700" data-id="${holiday.id}" title="Remover Feriado">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                `;
                listElement.appendChild(li);
            });
        } else {
            listElement.innerHTML = '<li class="text-gray-500">Nenhum feriado cadastrado.</li>';
        }
    },

    /**
     * Renderiza o gráfico de Gantt.
     * @param {Function} [callback=null] - Função a ser executada após a renderização.
     */
    // A variável para rastrear se o scroll inicial já foi feito.
    ganttInitialRenderDone: false,

    renderGanttChart: function(callback = null) {
        if (!DOM.ganttLabelsContainer || !DOM.ganttHeaderContainer ||
            !DOM.ganttGridContainer) return;
   

        // Limpa os contêineres principais
        DOM.ganttLabelsContainer.innerHTML = '';
        DOM.ganttHeaderContainer.innerHTML = '';
        DOM.ganttGridContainer.innerHTML = '';
        
        // Atualiza a variável de escala de texto baseada no nível de zoom atual
        const _baseZoom = 25;
        const _textScale = Math.max(0.6, Math.min(1.6, (state.ganttZoomLevel || _baseZoom) / _baseZoom));
        if (DOM.ganttScrollContainer) {
            DOM.ganttScrollContainer.style.setProperty('--gantt-text-scale', String(_textScale));
        }
        

        const fixedRowHeight = state.ganttRowHeightLevel || 80;
        const subRowHeight = state.ganttRowHeightLevel || 80; // Altura padrão
        const subRowMargin = 4;
        const ganttColumnWidth = state.ganttZoomLevel || 25;;
        DRAG_CONFIG.CELL_WIDTH = ganttColumnWidth;

        // Junta todos os eventos para calcular o período
        const allEvents = [...state.scheduledAssays, ...state.safetyScheduledAssays, ...state.calibrations];
                
        // Mantém a lógica original de cálculo do período
        if (allEvents.length > 0) {
            const allDates = allEvents.flatMap(e => [e.startDate, e.endDate]).map(dateStr => utils.parseDate(dateStr));
            const minDate = new Date(Math.min(...allDates));
            const maxDate = new Date(Math.max(...allDates));

            // Usar abordagem mais robusta para adicionar/subtrair dias
            const startDate = new Date(minDate.getTime() - (30 * 24 * 60 * 60 * 1000));
            const endDate = new Date(maxDate.getTime() + (60 * 24 * 60 * 60 * 1000));
            
            state.ganttStart = startDate;
            state.ganttEnd = endDate;
        } else {
            const today = new Date();
            state.ganttStart = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
            state.ganttEnd = new Date(today.getTime() + (21 * 24 * 60 * 60 * 1000));
        }

        let days = [];
        let currentDate = new Date(state.ganttStart);
        let dayCount = 0;
        
        // Calcular maxDays baseado no período real do cronograma + margem de segurança
        const timeDiff = state.ganttEnd.getTime() - state.ganttStart.getTime();
        const daysDiff = Math.ceil(timeDiff / (24 * 60 * 60 * 1000));
        const maxDays = Math.max(daysDiff + 10, 100); // Mínimo de 100 dias, ou período calculado + 10 dias de margem
        
        // Normalizar as datas para comparação (apenas data, sem hora)
        const endTime = new Date(state.ganttEnd.getFullYear(), state.ganttEnd.getMonth(), state.ganttEnd.getDate()).getTime();
        
        while (dayCount < maxDays) {
            const currentTime = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).getTime();
            
            if (currentTime > endTime) {
                break;
            }
            
            days.push(currentDate.toISOString().split('T')[0]);
            // Usar abordagem mais robusta para adicionar 1 dia
            currentDate = new Date(currentDate.getTime() + (24 * 60 * 60 * 1000));
            dayCount++;
        }
        
        if (dayCount >= maxDays) {
            console.warn('⚠️ Loop de dias limitado a', maxDays, 'dias para evitar problemas de performance');
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayString = today.toISOString().split('T')[0];
        let monthsHtml = [], daysHtml = [], currentMonth = null, daysInMonthCount = 0;
        const monthOptions = { month: 'long', year: 'numeric' };
        const dayOfWeekOptions = { weekday: 'short' };

        days.forEach((dateStr, index) => {
            const date = utils.parseDate(dateStr);
            const monthName = date.toLocaleString('pt-BR', monthOptions)
                                    .replace(/(^\w{1})|(\s+\w{1})/g, l => l.toUpperCase());
            if (date.getMonth() !== currentMonth) {
                if (currentMonth !== null) { monthsHtml.push(`<div class="text-center font-bold text-gray-700 border-l border-black h-[20px]" style="grid-column: span ${daysInMonthCount};">${monthsHtml.pop()}</div>`); }
                monthsHtml.push(monthName);
                currentMonth = date.getMonth();
                daysInMonthCount = 0;
            }
            daysInMonthCount++;
            const dayOfWeek = date.toLocaleString('pt-BR', dayOfWeekOptions).slice(0, 3).toUpperCase();
            const dayOfMonth = date.getDate();
            const isWeekend = ['SÁB', 'DOM'].includes(dayOfWeek);
            const isHoliday = utils.isHoliday(dateStr);
            const scheduleEvent = getEventForDate(dateStr);
            const isToday = dateStr === todayString;

            let dayClass = '';
            const isDark = document.documentElement.classList.contains('dark');
            if (isToday) { dayClass = 'bg-yellow-200 border-2 border-yellow-500'; } 
            else if (isHoliday) { dayClass = isDark ? 'bg-red-600' : 'bg-red-300'; } 
            else if (scheduleEvent) { dayClass = isDark ? 'bg-purple-500' : 'bg-blue-300'; }
            else if (isWeekend) { dayClass = isDark ? 'bg-gray-600' : 'bg-gray-300'; }

            const dayBorderClass = index === 0 ? '' : 'border-l border-grid';
            daysHtml.push(`
                <div 
                    class="flex flex-col items-center justify-center ${dayBorderClass} border-r border-grid font-semibold leading-none h-[40px] ${dayClass}" 
                    data-date="${dateStr}"
                >
                    <span class="text-gray-900" style="font-size: calc(10px * var(--gantt-text-scale, 1));">${dayOfWeek}</span>
                    <span class="text-gray-800" style="font-size: calc(12px * var(--gantt-text-scale, 1));">${dayOfMonth}</span>
                </div>
            `);
        });
        if (daysInMonthCount > 0) { monthsHtml.push(`<div class="text-center font-bold text-gray-700 h-[20px]" style="grid-column: span ${daysInMonthCount};">${monthsHtml.pop()}</div>`); }

        const totalGanttWidth = days.length * ganttColumnWidth;
        DOM.ganttHeaderContainer.innerHTML = `<div class="gantt-month-header-row grid bg-white z-10" style="grid-template-columns: repeat(${days.length}, ${ganttColumnWidth}px);">${monthsHtml.join('')}</div><div class="gantt-days-header-row grid bg-gray-50 z-10" style="grid-template-columns: repeat(${days.length}, ${ganttColumnWidth}px);">${daysHtml.join('')}</div>`;
        DOM.ganttHeaderContainer.style.width = `${totalGanttWidth}px`;
        DOM.ganttHeaderContainer.classList.add('border-b-2', 'border-grid');
        if (DOM.ganttPeriodLabel) {
            DOM.ganttPeriodLabel.textContent = `${utils.formatDate(state.ganttStart.toISOString().split('T')[0])} - ${utils.formatDate(state.ganttEnd.toISOString().split('T')[0])}`;
        }

        const headerRow = DOM.ganttHeaderContainer.querySelector('.gantt-days-header-row');
        if (headerRow) {
            headerRow.querySelectorAll('div[data-date]').forEach(cell => {
                const dateStr = cell.getAttribute('data-date');
                const holiday = state.holidays.find(h => {
                    const d = utils.parseDate(dateStr);
                    return d >= utils.parseDate(h.startDate) && d <= utils.parseDate(h.endDate);
                });
                const scheduleEvent = getEventForDate(dateStr);
                cell.addEventListener('mouseenter', (e) => {
                    if (holiday) {
                        tooltip.showHoliday(e, holiday);
                    } else if (scheduleEvent) {
                        tooltip.showEvent(e, scheduleEvent);
                    }
                });
                cell.addEventListener('mousemove', (e) => tooltip.position(e));
                cell.addEventListener('mouseleave', () => tooltip.hide());
            });
        }

        // Agrupa os ensaios por categoria
        const groupedAssays = {};

        // 1. Adiciona as categorias de segurança dinamicamente
        state.safetyCategories.forEach(cat => {
            // A chave é o nome da categoria, e o valor é uma lista de ensaios cujo 'setup' corresponde ao 'id' da categoria
            const safetyAssaysForCategory = state.safetyScheduledAssays.filter(a => a.setup === cat.id);
            groupedAssays[cat.name] = safetyAssaysForCategory;
        });

        // 2. Adiciona as categorias de eficiência dinamicamente
        state.efficiencyCategories.forEach(cat => {
            // A chave é o nome da categoria, e o valor é uma lista de ensaios cujo 'setup' corresponde ao 'id' da categoria
            const efficiencyAssaysForCategory = state.scheduledAssays.filter(a => a.setup === cat.id && a.status.toLowerCase() !== 'pendente' && a.type !== 'férias');
            groupedAssays[cat.name] = efficiencyAssaysForCategory;
        });

        // 3. Adiciona as categorias estáticas que não são dinâmicas
        groupedAssays['Férias'] = state.scheduledAssays.filter(a => a.type === 'férias');
        groupedAssays['Pendentes'] = state.scheduledAssays.filter(a => a.status.toLowerCase() === 'pendente');

        const categoriesToRender = [
                ...state.safetyCategories.map(cat => cat.name),
                'Férias',
                ...state.efficiencyCategories.map(cat => cat.name),
                'Pendentes'
            ];        
        // Removida lógica de drag and drop conflitante

        // Calcular a posição Y inicial de cada categoria
        const categoryPositions = {};
        let currentY = 0;

        categoriesToRender.forEach((category, index) => {
            const isSafetyCategory = state.safetyCategories.some(cat => cat.name === category);
                        
            categoryPositions[category] = currentY;

            const isLastCategory = index === categoriesToRender.length - 1;
            const assaysForCategory = groupedAssays[category] || [];
            let rowHeight, assaysToRender, isStacked, effectiveSubRowHeight;
            
           if (isSafetyCategory || category === 'Pendentes' || category === 'Férias') {
            isStacked = true;
            const { positionedAssays, subRowCount } = layoutEngine.calculateSubRows(assaysForCategory);
            assaysToRender = positionedAssays;

            if (isSafetyCategory) {
                const fixedContainerHeight = 40; 
                rowHeight = subRowCount * (fixedContainerHeight + subRowMargin) + subRowMargin;
                } else if (category === 'Férias') {
                    effectiveSubRowHeight = subRowHeight / 2;
                    rowHeight = subRowCount * (effectiveSubRowHeight + subRowMargin) + subRowMargin;
                } else { // Pendentes
                    effectiveSubRowHeight = subRowHeight;
                    rowHeight = subRowCount * (effectiveSubRowHeight + subRowMargin) + subRowMargin;
                }
                currentY += rowHeight;
            } else { // Terminais
                isStacked = false;
                assaysToRender = assaysForCategory;
                rowHeight = fixedRowHeight;
                currentY += rowHeight;
            }
            
            // Renderização do label da categoria
            const labelDiv = document.createElement('div');
            // Adicionamos a classe 'group' para controlar o hover do botão filho
            labelDiv.className = `gantt-label group relative p-2 text-sm font-semibold text-center whitespace-nowrap overflow-hidden text-ellipsis flex items-center justify-center ${isLastCategory ? 'border-r' : 'border-b border-r'} border-gray-400 ${isSafetyCategory ? 'bg-blue-800 text-white' : ''} ${category.includes('Terminal') ? 'bg-blue-800 text-white' : ''} ${category === 'Pendentes' ? 'bg-red-800 text-white' : ''} ${category === 'Férias' ? 'bg-gray-800 text-white' : ''}`;
            labelDiv.dataset.categoryName = category;
            labelDiv.style.height = `${rowHeight}px`;

            // Cria o span para o nome, para não interferir com o botão
            const labelText = document.createElement('span');
            labelText.textContent = category;
            labelDiv.appendChild(labelText);

            // Adiciona o botão de excluir apenas para linhas dinâmicas (não Férias/Pendentes)
            if (!['Férias', 'Pendentes'].includes(category)) {
                const deleteButton = document.createElement('button');
                deleteButton.className = 'btn-delete-row absolute right-2 text-white opacity-0 group-hover:opacity-100 transition-opacity';
                deleteButton.title = `Excluir linha "${category}"`;

                // Encontra o ID da categoria para associar ao botão
                const categoryObj = state.safetyCategories.find(c => c.name === category) || state.efficiencyCategories.find(c => c.name === category);
                if (categoryObj) {
                    deleteButton.dataset.categoryId = categoryObj.id;
                    deleteButton.dataset.categoryName = category; // Passa o nome para a mensagem de confirmação
                } else {
                    console.error('Categoria não encontrada no estado:', category);
                }

                deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
                labelDiv.appendChild(deleteButton);
            }

            DOM.ganttLabelsContainer.appendChild(labelDiv);

            // Renderização da linha do Gantt
            const rowContainer = document.createElement('div');
            rowContainer.className = `gantt-row-container relative ${isLastCategory ? '' : 'border-b border-gray-600'}`;
            rowContainer.dataset.category = category;
            rowContainer.style.height = `${rowHeight}px`;
            rowContainer.style.width = `${totalGanttWidth}px`;

            const backgroundGrid = document.createElement('div');
            backgroundGrid.className = 'absolute inset-0 grid';
            backgroundGrid.style.gridTemplateColumns = `repeat(${days.length}, ${ganttColumnWidth}px)`;
            days.forEach(day => {
                const dayCell = document.createElement('div');
                const isToday = day === todayString;
                const dayOfWeek = utils.parseDate(day).toLocaleString('pt-BR', { weekday: 'short' }).slice(0, 3).toUpperCase();
                const isWeekend = ['SÁB', 'DOM'].includes(dayOfWeek);
                const isHoliday = utils.isHoliday(day);
                const scheduleEvent = getEventForDate(day);
                let backgroundClass = 'bg-white';
                const isDark = document.documentElement.classList.contains('dark');
                if (isToday) { backgroundClass = 'bg-yellow-500'; }
                else if (isHoliday) { backgroundClass = isDark ? 'bg-red-700' : 'bg-red-300'; }
                else if (scheduleEvent) { backgroundClass = isDark ? 'bg-purple-700' : 'bg-blue-300'; }
                else if (isWeekend) { backgroundClass = isDark ? 'bg-gray-700' : 'bg-gray-300'; }
                dayCell.className = `h-full border-r border-grid ${backgroundClass}`;
                if (isHoliday) {
                    const holiday = state.holidays.find(h => utils.parseDate(day) >= utils.parseDate(h.startDate) && utils.parseDate(day) <= utils.parseDate(h.endDate));
                    dayCell.addEventListener('mouseenter', (e) => tooltip.showHoliday(e, holiday));
                    dayCell.addEventListener('mousemove', (e) => tooltip.position(e));
                    dayCell.addEventListener('mouseleave', () => tooltip.hide());
                } else if (scheduleEvent) {
                    dayCell.addEventListener('mouseenter', (e) => tooltip.showEvent(e, scheduleEvent));
                    dayCell.addEventListener('mousemove', (e) => tooltip.position(e));
                    dayCell.addEventListener('mouseleave', () => tooltip.hide());
                }
                backgroundGrid.appendChild(dayCell);
            });

            const foregroundGrid = document.createElement('div');
            if (isStacked) {
                foregroundGrid.className = 'absolute inset-0';
            } else {
                foregroundGrid.className = 'absolute inset-0 grid items-center';
                foregroundGrid.style.gridTemplateColumns = `repeat(${days.length}, ${ganttColumnWidth}px)`;
            }

            assaysToRender.forEach(assay => {
                const startDayIndex = days.indexOf(assay.startDate);
                if (startDayIndex === -1) return;
                const duration = Math.max(1, (utils.parseDate(assay.endDate) - utils.parseDate(assay.startDate)) / (1000 * 60 * 60 * 24) + 1);
                let statusClass, contentHTML;

                // Cor específica para ensaios de secadora (independente do status)
                if (assay.type === 'secadora') {
                    statusClass = 'bg-pink-600 text-white'; // Rosa escuro para destacar ensaios de secadora
                } else {
                    switch (assay.status?.toLowerCase()) {
                        case 'aguardando': statusClass = 'bg-red-600 text-white'; break;
                        case 'labelo': statusClass = 'bg-gray-400 text-white'; break;
                        case 'andamento': statusClass = 'bg-gray-600 text-white'; break;
                        case 'incompleto': statusClass = 'bg-orange-500 text-white'; break;
                        case 'concluido': statusClass = 'bg-green-500 text-white'; break;
                        case 'relatorio': statusClass = 'bg-blue-700 text-white'; break;
                        case 'pendente': statusClass = 'bg-yellow-500 text-black'; break;
                        case 'férias': statusClass = 'bg-amber-500 text-white'; break;
                        default: statusClass = 'bg-gray-400'; break;
                    }
                }

                const isMatch = searchUtils.matchesAssay(assay, state.ganttSearchQuery);
                contentHTML = `
                    <div class="relative w-full h-full gantt-event-content">
                        <button class="btn-view-details absolute top-1 right-1 z-20 p-0.5 rounded-full bg-black bg-opacity-20 hover:bg-opacity-40 text-white transition-colors" data-assay-id="${assay.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="16" x2="12" y2="12"></line>
                                <line x1="12" y1="8" x2="12.01" y2="8"></line>
                            </svg>
                        </button>
                        
                        <button class="gantt-task-menu-trigger">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </button>

                        ${assay.type === 'férias' ?
                        `<div class="flex items-center justify-center w-full h-full p-1 text-white z-10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 mr-2 flex-shrink-0">
                                <circle cx="12" cy="12" r="4"></circle>
                                <path d="M12 2v2"></path>
                                <path d="M12 20v2"></path>
                                <path d="M4.93 4.93l1.41 1.41"></path>
                                <path d="M17.66 17.66l1.41 1.41"></path>
                                <path d="M2 12h2"></path>
                                <path d="M20 12h2"></path>
                                <path d="M4.93 19.07l1.41-1.41"></path>
                                <path d="M17.66 6.34l1.41-1.41"></path>
                            </svg>
                            <div class="flex flex-col">
                                <span class="gantt-text font-bold">${assay.protocol}</span>
                            </div>
                        </div>` :
                        `<div class="flex flex-col items-center justify-center w-full h-full p-1 text-center z-10">
                            <span class="gantt-text font-bold">
                                ${[assay.protocol || 'N/A',
                                assay.orcamento || 'N/A', assay.assayManufacturer || 'N/A',
                                assay.model || 'N/A', assay.tensao || 'N/A',
                                assay.nominalLoad + 'kg' || 'N/A',
                                assay.reportDate ? assay.reportDate.split('-').slice(1).reverse().join('/') : ' ']
                                .filter(Boolean).join(' - ')}
                            </span>
                        </div>`
                    }
                </div>`;

                const eventDiv = document.createElement('div');
                eventDiv.className = `gantt-event rounded-md shadow-lg cursor-pointer select-none transition-all duration-100 ease-in-out hover:opacity-80 border-2 border-white flex items-center overflow-hidden ${statusClass}`;
                if (isMatch) {
                    eventDiv.classList.add('gantt-search-highlight');
                }
                
                // Posicionamento normal dos elementos
                if (isStacked) {
                    eventDiv.classList.add('absolute');
                    eventDiv.style.left = `${startDayIndex * ganttColumnWidth}px`;
                    eventDiv.style.width = `${duration * ganttColumnWidth}px`;
                    // Altura e top ajustados para as novas categorias empilhadas
                    if (isSafetyCategory) {
                        const fixedContainerHeight = 40; // Altura fixa para containers de segurança
                        eventDiv.style.top = `${assay.subRowIndex * (fixedContainerHeight + subRowMargin) + subRowMargin}px`;
                        eventDiv.style.height = `${fixedContainerHeight}px`;
                    } else if (category === 'Férias') {
                        eventDiv.style.top = `${assay.subRowIndex * (subRowHeight / 2 + subRowMargin) + subRowMargin}px`;
                        eventDiv.style.height = `${subRowHeight / 2}px`;
                    } else { // Pendentes
                        eventDiv.style.top = `${assay.subRowIndex * (subRowHeight + subRowMargin) + subRowMargin}px`;
                        eventDiv.style.height = `${subRowHeight}px`;
                    }
                } else {
                    const startColumn = startDayIndex + 1;
                    eventDiv.style.gridColumn = `${startColumn} / span ${duration}`;
                    eventDiv.style.gridRow = '1';
                    eventDiv.style.height = 'calc(100% - 8px)';
                    eventDiv.style.margin = '4px 0';
                }

                eventDiv.innerHTML = contentHTML;
                eventDiv.dataset.assayId = assay.id;
                foregroundGrid.appendChild(eventDiv);

                // Tooltips ricas e click para abrir modal
                eventDiv.addEventListener('mouseenter', (e) => tooltip.showAssay(e, assay));
                eventDiv.addEventListener('mousemove', (e) => tooltip.position(e));
                eventDiv.addEventListener('mouseleave', () => tooltip.hide());
                eventDiv.addEventListener('click', (e) => {
                    if (e.target.closest('.gantt-task-menu-trigger')) return;
                    modalHandlers.openViewGanttAssayModal(assay.id);
                });

                // Ajuste automático de tamanho do texto dentro do evento (shrink-to-fit)
                (function autoFitEventText() {
                    const contentEl = eventDiv.querySelector('.gantt-event-content');
                    const textEl = contentEl ? contentEl.querySelector('.gantt-text') : null;
                    if (!contentEl || !textEl) return;
                    // Remover override local para ler a escala herdada do contêiner
                    contentEl.style.removeProperty('--gantt-text-scale');
                    const inherited = getComputedStyle(contentEl).getPropertyValue('--gantt-text-scale');
                    const baseScale = Math.max(0.6, parseFloat(inherited) || 1);
                    let scale = baseScale;
                    let iter = 0;
                    const maxIter = 8;
                    const minScale = baseScale * 0.6; // não encolher abaixo de 60% da escala base
                    const fits = () => (
                        textEl.scrollWidth <= contentEl.clientWidth &&
                        textEl.scrollHeight <= contentEl.clientHeight
                    );
                    while (!fits() && iter < maxIter) {
                        scale = Math.max(minScale, scale - 0.08);
                        contentEl.style.setProperty('--gantt-text-scale', String(scale));
                        iter++;
                        if (scale === minScale) break;
                    }
                })();
            });

            rowContainer.appendChild(backgroundGrid);
            rowContainer.appendChild(foregroundGrid);
            DOM.ganttGridContainer.appendChild(rowContainer);
        });

        // ----------------------------------------------------
        // Lógica para renderizar os eventos de Calibração
        // Esta seção deve estar FORA do loop 'categoriesToRender'
        // ----------------------------------------------------
        const calibrationContainer = document.createElement('div');
calibrationContainer.className = 'absolute top-0 left-0 w-full h-full pointer-events-none z-10';
        DOM.ganttGridContainer.appendChild(calibrationContainer);

        state.calibrations.forEach(calib => {
            const startDayIndex = days.indexOf(calib.startDate);
            if (startDayIndex === -1) return;
            
            const duration = Math.max(1, (utils.parseDate(calib.endDate) - utils.parseDate(calib.startDate)) / (1000 * 60 * 60 * 24) + 1);

            let affectedTerminals = [];
            let calibTopPosition = 0;
            let calibRowHeight = 0;

            // Determinar os terminais afetados
            const calibrationType = (calib.protocol || '').toLowerCase();
            if (calibrationType.includes('energia') || calibrationType.includes('energy')) {
                // Primeiro, verificar o campo affectedTerminals se existir
                if (calib.affectedTerminals) {
                    if (calib.affectedTerminals === '1-4') {
                        affectedTerminals = [1, 2, 3, 4];
                    } else if (calib.affectedTerminals === '5-8') {
                        affectedTerminals = [5, 6, 7, 8];
                    }
                } else {
                    // Fallback para verificação no protocol (código antigo)
                    if (calib.protocol?.includes('1-4') || calib.protocol?.includes('1 a 4')) {
                        affectedTerminals = [1, 2, 3, 4];
                    } else if (calib.protocol?.includes('5-8') || calib.protocol?.includes('5 a 8')) {
                        affectedTerminals = [5, 6, 7, 8];
                    } else {
                        // fallback usando setup
                        if (calib.setup && calib.setup <= 4) {
                            affectedTerminals = [1, 2, 3, 4];
                        } else {
                            affectedTerminals = [5, 6, 7, 8];
                        }
                    }
                }
            } else if (
                calibrationType.includes('temperatura') || calibrationType.includes('temperature') ||
                calibrationType.includes('pressão')        || calibrationType.includes('pressure')
            ) {
                // temperatura e pressão → todos os 8 terminais
                affectedTerminals = [1, 2, 3, 4, 5, 6, 7, 8];
            } else {
                // padrão → todos os terminais
                affectedTerminals = [1, 2, 3, 4, 5, 6, 7, 8];
            }

            // Ordenar e calcular altura e top
            affectedTerminals.sort((a, b) => a - b);
            const terminalPositions = affectedTerminals.map(t => categoryPositions[`Terminal ${t}`] || 0);
            const minTerminalPosition = Math.min(...terminalPositions);
            const firstTerminal = affectedTerminals[0];
            const lastTerminal = affectedTerminals[affectedTerminals.length - 1];
            const numberOfTerminals = lastTerminal - firstTerminal + 1;

            calibTopPosition = minTerminalPosition;
            calibRowHeight   = numberOfTerminals * fixedRowHeight;

            // Determinar cor (sem transparência)
            let calibrationColor = 'bg-purple-500';
            if (calibrationType.includes('energia') || calibrationType.includes('energy')) {
                calibrationColor = 'bg-blue-500';
            } else if (
                calibrationType.includes('temperatura') || calibrationType.includes('temperature') ||
                calibrationType.includes('pressão')        || calibrationType.includes('pressure')
            ) {
                calibrationColor = 'bg-black'; // preto para temperatura/pressão
            } else {
                calibrationColor = 'bg-purple-500';
            }

            const calibDiv = document.createElement('div');
            calibDiv.className = `gantt-calibration-event rounded-md shadow-lg transition-all duration-100 ease-in-out hover:opacity-80 border-2 border-white overflow-hidden ${calibrationColor}`;
            calibDiv.style.position      = 'absolute';
            calibDiv.style.left          = `${startDayIndex * ganttColumnWidth}px`;
            calibDiv.style.top           = `${calibTopPosition}px`;
            calibDiv.style.width         = `${duration * ganttColumnWidth}px`;
            calibDiv.style.height        = `${calibRowHeight}px`;
            calibDiv.style.pointerEvents = 'auto';

            // Texto exibido
            let displayText = calib.protocol || 'Calibração';
            if (affectedTerminals.length === 4) {
                displayText = (affectedTerminals[0] === 1) ? 'Energia 1-4' : 'Energia 5-8';
            } else if (affectedTerminals.length === 8) {
                displayText = 'Temperatura e Pressão';
            }

            // Tooltip
            const affectedTerminalsText = affectedTerminals.join(', ');
            const calibrationInfo = `
Tipo: ${calib.protocol || 'N/A'}
Terminais: ${affectedTerminalsText}
Período: ${calib.startDate} a ${calib.endDate}
${calib.notes ? `Observações: ${calib.notes}` : ''}
            `.trim();

            const isMatchCalib = searchUtils.matchesCalibration(calib, state.ganttSearchQuery);
            calibDiv.innerHTML = `
                <div class="relative w-full h-full flex items-center justify-center p-1 text-center text-white" style="writing-mode: vertical-rl; text-orientation: mixed;">
                    <span class="gantt-text font-semibold">${displayText}</span>
                    <button class="btn-view-details absolute top-1 right-1 z-20 p-0.5 rounded-full bg-black bg-opacity-20 hover:bg-opacity-40 text-white transition-colors" data-assay-id="${calib.id}" data-is-calibration="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </button>
                </div>
            `;
            // Tooltips para calibração e click abre modal
            calibDiv.addEventListener('mouseenter', (e) => tooltip.showCalibration(e, calib));
            calibDiv.addEventListener('mousemove', (e) => tooltip.position(e));
            calibDiv.addEventListener('mouseleave', () => tooltip.hide());
            calibDiv.addEventListener('click', () => {
                modalHandlers.openViewGanttCalibrationModal(calib.id);
            });
            if (isMatchCalib) {
                calibDiv.classList.add('gantt-search-highlight');
            }

            // Tooltip antigo removido: não definir atributos nativos
            calibrationContainer.appendChild(calibDiv);

            // Ajuste automático para texto de calibração (vertical): shrink-to-fit respeitando a escala herdada
            (function autoFitCalibrationText() {
                const target = calibDiv; // aplica escala no contêiner para herdar na .gantt-text
                const textEl = target.querySelector('.gantt-text');
                if (!textEl) return;
                // Remover override local para ler a escala herdada do contêiner
                target.style.removeProperty('--gantt-text-scale');
                const inherited = getComputedStyle(target).getPropertyValue('--gantt-text-scale');
                const baseScale = Math.max(0.6, parseFloat(inherited) || 1);
                let scale = baseScale;
                let iter = 0;
                const maxIter = 8;
                const minScale = baseScale * 0.6; // não encolher abaixo de 60% da escala base
                const fits = () => (
                    textEl.scrollWidth <= target.clientWidth &&
                    textEl.scrollHeight <= target.clientHeight
                );
                while (!fits() && iter < maxIter) {
                    scale = Math.max(minScale, scale - 0.08);
                    target.style.setProperty('--gantt-text-scale', String(scale));
                    iter++;
                    if (scale === minScale) break;
                }
            })();
        });

        // adiciona css tooltip apenas 1x
        // Tooltip antigo via CSS (::after) removido para evitar conflitos com tooltip rico

        // Renderiza setas de vínculo entre ensaios após o Gantt
        renderers.renderAssayLinks();

        // ----------------------------------------------------
        // Callback opcional após renderização
        // ----------------------------------------------------
        if (callback && typeof callback === 'function') {
            callback();
        }
    },
    

/** Renderiza o painel (dashboard) com todos os cards e gráficos. */
renderDashboard: () => {
    const cardsContainer = document.getElementById('dashboard-cards');
    if (!cardsContainer) return;
    
    cardsContainer.innerHTML = '';
    const suppliers = ['MHC', 'Swissatest'];
    const totalAssays = state.historicalAssays.filter(assay => {
        const type = (assay.type || '').toLowerCase();
        return type !== 'férias' && !type.includes('calibracao');
    }).length;
    
    // 1. A chamada da função agora retorna um objeto.
    const possibleAssaysResult = calculations.calculatePossibleAssays();
    // 2. Extraímos o número de ensaios e o nome do reagente.
    const possibleAssays = possibleAssaysResult.count;
    // 3. Criamos a variável com o texto a ser exibido ANTES de usá-la.
    const limitingReagentText = possibleAssays > 0 ? `<p class="text-xs font-medium text-gray-500 mt-2">Reagente: ${possibleAssaysResult.limitingReagent}</p>` : '';

    const todayAssays = dashboardUtils.getTodayAssays();
    const upcomingAssays = dashboardUtils.getUpcomingAssays(10);

    //Popula o filtro de ano com base nos ensaios históricos
    renderers.populateYearFilter();

    // Atualiza a classe para um layout de 2 colunas para os cards superiores
    cardsContainer.className = 'grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6';
    
    // Criar array para armazenar todo o HTML
    let allCardsHTML = '';
    
    // Cards de fornecedores
    suppliers.forEach(supplier => {
        let itemsHTML = '';
        const supplierItems = state.inventory.filter(item => item.manufacturer === supplier);
        
        if (supplierItems.length === 0) {
            itemsHTML = '<li class="text-sm text-gray-500">Nenhum item em estoque.</li>';
        } else {
            supplierItems.forEach(item => {
                const unit = item.reagent === 'Tiras de sujidade' ? 'un' : 'g';
                itemsHTML += `
                    <li class="text-sm text-gray-600 flex justify-between">
                        <span class="truncate">${item.reagent} (${item.lot})</span>
                        <span class="font-semibold whitespace-nowrap">${item.quantity.toLocaleString('pt-BR')} ${unit}</span>
                    </li>
                `;
            });
        }
        
        allCardsHTML += `
            <div class="bg-white p-4 md:p-6 rounded-xl shadow-lg border border-gray-200">
                <h3 class="font-bold text-base md:text-lg text-gray-700 mb-2">${supplier}</h3>
                <ul class="max-h-40 overflow-y-auto">${itemsHTML}</ul>
            </div>
        `;
    });
    
    // Cards de totais
    allCardsHTML += `
        <div class="bg-white p-4 md:p-6 rounded-xl shadow-lg border border-gray-200 flex flex-col justify-center items-center">
            <h3 class="font-bold text-base md:text-lg text-gray-700">Total de Ensaios</h3>
            <p class="text-3xl md:text-4xl font-extrabold text-blue-600 mt-2">${totalAssays}</p>
        </div>
        <div class="bg-white p-4 md:p-6 rounded-xl shadow-lg border border-gray-200 flex flex-col justify-center items-center">
            <h3 class="font-bold text-base md:text-lg text-gray-700 text-center">Ensaios Possíveis</h3>
            <p class="text-3xl md:text-4xl font-extrabold text-green-600 mt-2">${possibleAssays}</p>
            ${limitingReagentText}
        </div>
    `;
    
    // Card: Ensaios em andamento hoje
    const todayAssaysHTML = todayAssays.length > 0 ?
    todayAssays.map(assay => `
        <div class="${getStatusCardBackground(assay.status, assay.type)} p-3 rounded-lg mb-2 border border-gray-200 dark:border-gray-500 border-l-4 ${getStatusBorderColor(assay.status)}">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <h4 class="font-semibold ${getStatusTextColor(assay.status, assay.type)} text-sm truncate" title="${assay.protocol}">${assay.protocol}</h4>
                    <p class="text-xs ${getStatusTextColor(assay.status, assay.type)}">${getTerminalName(assay.setup)}</p>
                    <p class="text-xs ${getStatusTextColor(assay.status, assay.type)}">${assay.assayManufacturer || 'N/A'} - ${assay.model || 'N/A'}</p>
                </div>
                <span class="status-badge text-xs px-2 py-1 rounded-full ${getStatusBadgeClass(assay.status, assay.type)}">
                    ${ASSAY_STATUS_MAP[assay.status.toLowerCase()] || assay.status}
                </span>
            </div>
            <div class="mt-2 flex justify-between items-center text-xs">
                <span class="${getStatusTextColor(assay.status, assay.type)}">${utils.formatDate(assay.startDate)} - ${utils.formatDate(assay.endDate)}</span>
                <button class="btn-view-details text-blue-500 hover:text-blue-700" data-assay-id="${assay.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                </button>
            </div>
        </div>
    `).join('') :
    '<p class="text-gray-500 text-sm text-center py-4">Nenhum ensaio em andamento hoje</p>';

allCardsHTML += `
    <div class="dashboard-card bg-white p-4 md:p-6 rounded-xl shadow-lg border border-gray-200">
        <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-base md:text-lg text-gray-700">Ensaios Hoje</h3>
            <span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">${todayAssays.length}</span>
        </div>
        <div class="max-h-60 overflow-y-auto">
            ${todayAssaysHTML}
        </div>
    </div>
`;
    
// Card: Próximos Ensaios (3 dias)
let upcomingAssaysHTML = '';

if (upcomingAssays.length > 0) {
    upcomingAssays.slice(0, 8).forEach(assay => {
        const formattedDate = assay.parsedDate.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        
        // Obter a classe CSS baseada no status (usando a mesma lógica do Gantt)
        const statusClass = getStatusBadgeClass(assay.status, assay.type);
        const borderColor = getStatusBorderColor(assay.status);
        const cardBackground = getStatusCardBackground(assay.status, assay.type);


upcomingAssaysHTML += `
    <div class="${cardBackground} p-3 rounded-lg mb-2 border border-gray-200 dark:border-gray-500 border-l-4 ${borderColor}">
        <div class="flex justify-between items-start">
            <div class="flex-1">
                <h4 class="font-semibold ${getStatusTextColor(assay.status, assay.type)} text-sm truncate" title="${assay.protocol}">
                    ${assay.protocol}
                </h4>
                <p class="text-xs ${getStatusTextColor(assay.status, assay.type)}">${getTerminalName(assay.setup)}</p>
                <p class="text-xs ${getStatusTextColor(assay.status, assay.type)} truncate">${assay.assayManufacturer || 'N/A'} - ${assay.model || 'N/A'}</p>
            </div>
            <span class="status-badge text-xs px-2 py-1 rounded-full ${statusClass}">
                ${ASSAY_STATUS_MAP[assay.status.toLowerCase()] || assay.status}
            </span>
        </div>
        <div class="mt-2 flex justify-between items-center text-xs">
            <span class="${getStatusTextColor(assay.status, assay.type)}">${utils.formatDate(assay.startDate)} - ${utils.formatDate(assay.endDate)}</span>
            <button class="btn-view-details text-blue-500 hover:text-blue-700" data-assay-id="${assay.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
            </button>
        </div>
    </div>
`;
    });
    
    if (upcomingAssays.length > 8) {
        upcomingAssaysHTML += `<p class="text-xs text-gray-500 text-center mt-2">+${upcomingAssays.length - 8} mais programados</p>`;
    }
} else {
    upcomingAssaysHTML = '<p class="text-gray-500 text-sm text-center py-4">Nenhum ensaio programado</p>';
}
    
allCardsHTML += `
    <div class="dashboard-card bg-white p-4 md:p-6 rounded-xl shadow-lg border border-gray-200">
        <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-base md:text-lg text-gray-700">Próximos Ensaios</h3>
            <span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">${upcomingAssays.length}</span>
        </div>
        <div class="max-h-60 overflow-y-auto">
            ${upcomingAssaysHTML}
        </div>
    </div>
`;
    
// Adicionar todo o HTML de uma vez
cardsContainer.innerHTML = allCardsHTML;
    
// Adicionar event listeners
document.querySelectorAll('.btn-view-details').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const assayId = parseInt(e.currentTarget.dataset.assayId);
        if (!isNaN(assayId)) {
            modalHandlers.openViewGanttAssayModal(assayId);
        }
    });
});
    
renderers.renderCharts();
    
setTimeout(() => {
const chartContainers = document.querySelectorAll('.chart-container');
chartContainers.forEach(container => {
    const isMobile = window.innerWidth < 768;
    container.style.height = isMobile ? '250px' : '320px';
    container.style.width = '100%';
    container.style.padding = isMobile ? '5px' : '10px';
    container.style.boxSizing = 'border-box';
    
    const canvas = container.querySelector('canvas');
    if (canvas) {
        // Resetar e redimensionar o canvas
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        
        // Redimensionar o gráfico Chart.js se existir
        const canvasId = canvas.id;
        if (state.charts[canvasId]) {
            state.charts[canvasId].resize();
        }
    }
});
}, 100);
},

    /** Prepara os dados para os gráficos. */
    prepareChartData: (allAssays) => {
        const manufacturerData = allAssays.reduce((acc, assay) => {
            const manufacturer = assay.assayManufacturer;
            if (!acc[manufacturer]) {
                acc[manufacturer] = {
                    count: 0,
                    totalConsumption: 0,
                    reagents: {
                        'Pó Base': 0,
                        'Perborato': 0,
                        'TAED': 0,
                        'Tiras de sujidade': 0
                    }
                };
            }
            // Verifica se a propriedade lots existe e é um array para a nova lógica
            if (assay.lots && Array.isArray(assay.lots.poBase)) {
                // Nova lógica para múltiplos lotes
                const consumptionPoBase = assay.lots.poBase.reduce((sum, l) => sum + (16 * assay.nominalLoad + 54) * l.cycles * 0.77, 0);
                const consumptionPerborato = assay.lots.perborato.reduce((sum, l) => sum + (16 * assay.nominalLoad + 54) * l.cycles * 0.20, 0);
                const consumptionTaed = assay.lots.taed.reduce((sum, l) => sum + (16 * assay.nominalLoad + 54) * l.cycles * 0.03, 0);
                const consumptionTiras = assay.lots.tiras.reduce((sum, l) => sum + calculations.calculateTiras(assay.nominalLoad) * l.cycles, 0);
                
                acc[manufacturer].reagents['Pó Base'] += consumptionPoBase;
                acc[manufacturer].reagents['Perborato'] += consumptionPerborato;
                acc[manufacturer].reagents['TAED'] += consumptionTaed;
                acc[manufacturer].reagents['Tiras de sujidade'] += consumptionTiras;
                acc[manufacturer].totalConsumption += consumptionPoBase + consumptionPerborato + consumptionTaed;
            } else {
                // Lógica original para compatibilidade
                const consumption = calculations.calculateConsumption(assay.nominalLoad, assay.cycles);
                acc[manufacturer].reagents['Pó Base'] += consumption.poBase;
                acc[manufacturer].reagents['Perborato'] += consumption.perborato;
                acc[manufacturer].reagents['TAED'] += consumption.taed;
                acc[manufacturer].reagents['Tiras de sujidade'] += consumption.tiras;
                acc[manufacturer].totalConsumption += consumption.poBase + consumption.perborato + consumption.taed;
            }
            acc[manufacturer].count += 1;
            return acc;
        }, {});
        return {
            manufacturerData
        };
    },

    /**
     * Renderiza ou atualiza o gráfico de consumo por lote.
     * @param {string[]} allReagents - Lista de todos os reagentes.
     */
    renderConsumptionByLotChart: (allReagents, allAssays) => {
        const consumptionByLot = {};
        allAssays.forEach(assay => {
            if (!assay.lots) return;
            
            if (Array.isArray(assay.lots.poBase)) {
                // Nova lógica para múltiplos lotes
                Object.entries(assay.lots).forEach(([reagentKey, lotsArray]) => {
                    lotsArray.forEach(c => {
                        if (c.lot && c.cycles > 0) {
                            if (!consumptionByLot[c.lot]) consumptionByLot[c.lot] = {};
                            
                            let reagentName;
                            switch(reagentKey) {
                                case 'poBase': reagentName = 'Pó Base'; break;
                                case 'perborato': reagentName = 'Perborato'; break;
                                case 'taed': reagentName = 'TAED'; break;
                                case 'tiras': reagentName = 'Tiras de sujidade'; break;
                                default: return;
                            }
                            
                            const consumedAmount = calculations.calculateConsumption(assay.nominalLoad, c.cycles)[reagentKey];
                            consumptionByLot[c.lot][reagentName] = (consumptionByLot[c.lot][reagentName] || 0) + consumedAmount;
                        }
                    });
                });
            } else {
                // Lógica antiga
                const consumption = calculations.calculateConsumption(assay.nominalLoad, assay.cycles);
                const lotMap = [{
                    lot: assay.lots.poBase, amount: consumption.poBase, reagent: 'Pó Base'
                }, {
                    lot: assay.lots.perborato, amount: consumption.perborato, reagent: 'Perborato'
                }, {
                    lot: assay.lots.taed, amount: consumption.taed, reagent: 'TAED'
                }, {
                    lot: assay.lots.tiras, amount: consumption.tiras, reagent: 'Tiras de sujidade'
                }];
                lotMap.forEach(c => {
                    if (c.lot && c.reagent && c.amount > 0) {
                        if (!consumptionByLot[c.lot]) consumptionByLot[c.lot] = {};
                        consumptionByLot[c.lot][c.reagent] = (consumptionByLot[c.lot][c.reagent] || 0) + c.amount;
                    }
                });
            }
        });
        const consumedLots = safeObjectKeys(consumptionByLot || {});
        const chartData = {
            labels: consumedLots,
            datasets: allReagents.map(reagent => ({
                label: reagent,
                data: consumedLots.map(lot => consumptionByLot[lot]?.[reagent] || 0),
                backgroundColor: REAGENT_COLORS[reagent]
            }))
        };
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            layout: {
                padding: {
                    left: 10,
                    right: 10,
                    top: 10,
                    bottom: 10
                }
            },
            scales: {
                x: {
                    stacked: false,
                    display: true,
                    grid: {
                        display: true
                    },
                    ticks: {
                        display: true,
                        maxRotation: 45,
                        minRotation: 0,
                        font: {
                            size: window.innerWidth < 768 ? 10 : 12
                        }
                    }
                },
                y: {
                    stacked: false,
                    beginAtZero: true,
                    display: true,
                    grid: {
                        display: true
                    },
                    ticks: {
                        display: true,
                        font: {
                            size: window.innerWidth < 768 ? 10 : 12
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        padding: 15,
                        font: {
                            size: window.innerWidth < 768 ? 10 : 12
                        },
                        color: (document.documentElement.classList.contains('dark') ? '#f8fafc' : '#111')
                    }
                },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) {
                                if (context.dataset.label && context.dataset.label.includes('Quantidade')) {
                                    label += Math.round(context.parsed.y) + ' un';
                                } else if (context.dataset.label && context.dataset.label.includes('Consumo')) {
                                    label += Math.round(context.parsed.y) + ' g';
                                } else {
                                    label += Math.round(context.parsed.y);
                                }
                            }
                            return label;
                        }
                    }
                },
                datalabels: {
                    display: false
                }
            }
        };
        renderers.createOrUpdateChart('consumptionChart', 'bar', chartData, {
            scales: {
                x: { stacked: false },
                y: { stacked: false, beginAtZero: true }
            },
            plugins: { datalabels: { display: false } }
        });

        renderers.renderAssayLinks();
    },

renderAssayLinks: () => {
    setTimeout(() => {
        const container = DOM.ganttGridContainer;
        if (!container) return;

        const oldSvg = document.getElementById('gantt-dependency-layer');
        if (oldSvg) oldSvg.remove();

        const svgLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svgLayer.id = 'gantt-dependency-layer';
        svgLayer.style.width = `${container.scrollWidth}px`;
        svgLayer.style.height = `${container.scrollHeight}px`;
        
        container.appendChild(svgLayer);

        // Definições dos marcadores (Mantidos iguais)
        svgLayer.innerHTML = `
            <defs>
                <marker id="arrowhead-gray" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="0" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" /></marker>
                <marker id="arrowhead-blue" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="0" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb" /></marker>
                <marker id="arrowhead-green" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="0" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#16a34a" /></marker>
                <marker id="arrowhead-red" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="0" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" /></marker>
                <marker id="arrowhead-orange" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="0" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ea580c" /></marker>
                <marker id="arrowhead-purple" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="0" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9333ea" /></marker>
                <marker id="arrowhead-pink" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="0" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#db2777" /></marker>
                <marker id="arrowhead-cyan" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="0" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0891b2" /></marker>
                <marker id="arrowhead-amber" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="0" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#d97706" /></marker>
            </defs>
        `;

        const isDarkTheme = document.documentElement.classList.contains('dark');
        const LINK_COLORS = isDarkTheme ? [
            { stroke: '#3b82f6', marker: 'url(#arrowhead-blue)' },
            { stroke: '#22c55e', marker: 'url(#arrowhead-green)' },
            { stroke: '#ef4444', marker: 'url(#arrowhead-red)' },
            { stroke: '#f59e0b', marker: 'url(#arrowhead-orange)' },
            { stroke: '#a855f7', marker: 'url(#arrowhead-purple)' },
            { stroke: '#e11d48', marker: 'url(#arrowhead-pink)' },
            { stroke: '#06b6d4', marker: 'url(#arrowhead-cyan)' },
            { stroke: '#fde047', marker: 'url(#arrowhead-amber)' }
        ] : [
            { stroke: '#2563eb', marker: 'url(#arrowhead-blue)' },
            { stroke: '#16a34a', marker: 'url(#arrowhead-green)' },
            { stroke: '#dc2626', marker: 'url(#arrowhead-red)' },
            { stroke: '#ea580c', marker: 'url(#arrowhead-orange)' },
            { stroke: '#9333ea', marker: 'url(#arrowhead-purple)' },
            { stroke: '#db2777', marker: 'url(#arrowhead-pink)' },
            { stroke: '#0891b2', marker: 'url(#arrowhead-cyan)' },
            { stroke: '#d97706', marker: 'url(#arrowhead-amber)' }
        ];

        const containerRect = container.getBoundingClientRect();

        (state.assayLinks || []).forEach((link, index) => {
            const effEl = container.querySelector(`.gantt-event[data-assay-id="${link.from}"]`);
            const safEl = container.querySelector(`.gantt-event[data-assay-id="${link.to}"]`);

            if (!effEl || !safEl) return;

            const r1 = effEl.getBoundingClientRect();
            const r2 = safEl.getBoundingClientRect();

            // Pontos de início e fim (mantendo a lógica correta de posição)
            const startX = (r1.right - containerRect.left) + container.scrollLeft;
            const startY = (r1.top - containerRect.top) + container.scrollTop + (r1.height / 2);

            const gapForArrowHead = 25;
            const endX = (r2.left - containerRect.left) + container.scrollLeft - gapForArrowHead;
            const endY = (r2.top - containerRect.top) + container.scrollTop + (r2.height / 2);

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            
            let d;
            // --- LÓGICA "QUADRADA" (ORTOGONAL) ---
            
            if (endX > startX + 20) {
                // Caso normal: Destino à frente
                // Desenha: Sai para direita -> Desce/Sobe -> Vai para direita
                const midX = (startX + endX) / 2;
                
                d = `M ${startX} ${startY} 
                     L ${midX} ${startY} 
                     L ${midX} ${endY} 
                     L ${endX} ${endY}`;
            } else {
                // Caso de retorno: Destino atrás ou muito perto
                // Desenha: Sai para direita -> Desce um pouco -> Volta para esquerda -> Desce até o fim -> Vai para direita
                const loopOut = startX + 40; // Avança 40px
                const loopBack = endX - 40;  // Recua 40px antes do alvo
                const midY = (startY + endY) / 2; // Meio do caminho vertical

                d = `M ${startX} ${startY} 
                     L ${loopOut} ${startY} 
                     L ${loopOut} ${midY} 
                     L ${loopBack} ${midY} 
                     L ${loopBack} ${endY} 
                     L ${endX} ${endY}`;
            }

            const colorSet = LINK_COLORS[index % LINK_COLORS.length];

            path.setAttribute("d", d);
            path.setAttribute("class", "dependency-arrow");
            path.setAttribute("stroke", colorSet.stroke);
            path.setAttribute("marker-end", colorSet.marker);
            // Removemos fill:none do CSS e garantimos aqui para evitar preenchimento acidental em linhas fechadas
            path.setAttribute("fill", "none"); 

            svgLayer.appendChild(path);
        });
    }, 50);
},

    /**
     * Renderiza ou atualiza o gráfico de estoque por lote.
     * @param {string[]} allReagents - Lista de todos os reagentes.
     */
    renderStockByLotChart: (allReagents) => {
        const stockByLot = state.inventory.filter(i => i.quantity > 0);
        const stockLots = [...new Set(stockByLot.map(i => i.lot))];
        const chartData = {
            labels: stockLots,
            datasets: allReagents.map(reagent => ({
                label: reagent,
                data: stockLots.map(lot => {
                    const item = stockByLot.find(i => i.lot === lot && i.reagent === reagent);
                    return item ? item.quantity : 0;
                }),
                backgroundColor: REAGENT_COLORS[reagent]
            }))
        };
        renderers.createOrUpdateChart('stockChart', 'bar', chartData, {
            scales: {
                x: { stacked: false },
                y: { stacked: false, beginAtZero: true }
            },
            plugins: { datalabels: { display: false } }
        });
    },

    /** Renderiza ou atualiza o gráfico de ensaios ao longo do tempo. */
    renderAssaysOverTimeChart: (allAssays) => {
        const monthlyAssayCounts = {};
        allAssays.forEach(assay => {
            const assayDate = utils.parseDate(assay.startDate);
            const yearMonth = `${assayDate.getFullYear()}-${(assayDate.getMonth() + 1).toString().padStart(2, '0')}`;
            if (!monthlyAssayCounts[yearMonth]) {
                monthlyAssayCounts[yearMonth] = 0;
            }
            monthlyAssayCounts[yearMonth]++;
        });
        const sortedMonths = safeObjectKeys(monthlyAssayCounts || {}).sort();
        const labels = sortedMonths.map(ym => {
            const [year, month] = ym.split('-');
            const d = new Date(year, parseInt(month) - 1, 1);
            return d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
        });
        const data = sortedMonths.map(ym => monthlyAssayCounts[ym]);
        const totalAssayCount = allAssays.length;
        const numberOfMonths = sortedMonths.length;
        const average = numberOfMonths > 0 ? totalAssayCount / numberOfMonths : 0;
        const averageData = new Array(labels.length).fill(average);
        const chartData = {
            labels: labels,
            datasets: [{
                label: 'Ensaios por Mês',
                data: data,
                fill: false,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }, {
                label: 'Média Mensal',
                data: averageData,
                fill: false,
                borderColor: 'rgb(255, 99, 132)',
                borderDash: [5, 5],
                pointRadius: 0
            }]
        };
        renderers.createOrUpdateChart('assaysOverTimeChart', 'line', chartData, {
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            },
            plugins: { datalabels: { display: false } }
        });
    },

    /** Renderiza ou atualiza o gráfico de consumo mensal de reagentes. */
    renderMonthlyConsumptionChart: (allReagents, allAssays) => {
        const monthlyConsumption = {};
        allAssays.forEach(assay => {
            const assayDate = utils.parseDate(assay.startDate);
            const yearMonth = `${assayDate.getFullYear()}-${(assayDate.getMonth() + 1).toString().padStart(2, '0')}`;
            if (!monthlyConsumption[yearMonth]) {
                monthlyConsumption[yearMonth] = { 'Pó Base': 0, 'Perborato': 0, 'TAED': 0, 'Tiras de sujidade': 0 };
            }
            // Nova lógica para múltiplos lotes
            if (assay.lots && Array.isArray(assay.lots.poBase)) {
                const consumptionPoBase = assay.lots.poBase.reduce((sum, l) => sum + (16 * assay.nominalLoad + 54) * l.cycles * 0.77, 0);
                const consumptionPerborato = assay.lots.perborato.reduce((sum, l) => sum + (16 * assay.nominalLoad + 54) * l.cycles * 0.20, 0);
                const consumptionTaed = assay.lots.taed.reduce((sum, l) => sum + (16 * assay.nominalLoad + 54) * l.cycles * 0.03, 0);
                const consumptionTiras = assay.lots.tiras.reduce((sum, l) => sum + calculations.calculateTiras(assay.nominalLoad) * l.cycles, 0);
                
                monthlyConsumption[yearMonth]['Pó Base'] += consumptionPoBase;
                monthlyConsumption[yearMonth]['Perborato'] += consumptionPerborato;
                monthlyConsumption[yearMonth]['TAED'] += consumptionTaed;
                monthlyConsumption[yearMonth]['Tiras de sujidade'] += consumptionTiras;
            } else {
                // Lógica antiga para compatibilidade
                const consumption = calculations.calculateConsumption(assay.nominalLoad, assay.cycles);
                monthlyConsumption[yearMonth]['Pó Base'] += consumption.poBase;
                monthlyConsumption[yearMonth]['Perborato'] += consumption.perborato;
                monthlyConsumption[yearMonth]['TAED'] += consumption.taed;
                monthlyConsumption[yearMonth]['Tiras de sujidade'] += consumption.tiras;
            }
        });
        const sortedMonths = safeObjectKeys(monthlyConsumption || {}).sort();
        const labels = sortedMonths.map(ym => {
            const [year, month] = ym.split('-');
            const d = new Date(year, parseInt(month) - 1, 1);
            return d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
        });
        const datasets = allReagents.map(reagent => ({
            label: reagent,
            data: sortedMonths.map(ym => monthlyConsumption[ym][reagent] || 0),
            backgroundColor: REAGENT_COLORS[reagent]
        }));
        const chartData = { labels, datasets };
        renderers.createOrUpdateChart('monthlyConsumptionChart', 'bar', chartData, {
            scales: { x: { stacked: false }, y: { stacked: false, beginAtZero: true } },
            plugins: { datalabels: { display: false } }
        });
    },

    /**
     * Renderiza ou atualiza o gráfico de ensaios por fabricante.
     * @param {Object} manufacturerData - Dados de ensaios por fabricante.
     */
    renderAssaysByManufacturerChart: (manufacturerData) => {
        const sortedByAssayCount = Object.entries(manufacturerData).sort(([, a], [, b]) => b.count - a.count);
        const sortedAssayLabels = sortedByAssayCount.map(([label]) => label);
        const sortedAssayCounts = sortedByAssayCount.map(([, data]) => data.count);
        const chartData = {
            labels: sortedAssayLabels,
            datasets: [{
                label: 'Nº de Ensaios',
                data: sortedAssayCounts,
                backgroundColor: sortedAssayLabels.map((_, index) => COLOR_PALETTE[index % COLOR_PALETTE.length])
            }]
        };
        renderers.createOrUpdateChart('assaysByManufacturerChart', 'bar', chartData, {
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const manufacturer = sortedAssayLabels[index];
                    const filterEl = document.getElementById('filter-manufacturer-dashboard');
                    if (filterEl) {
                        filterEl.value = manufacturer;
                        renderers.renderAssaysTables('dashboard');
                        utils.showToast(`Tabela filtrada por: ${manufacturer}`);
                    }
                }
            },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            plugins: { datalabels: { display: false } }
        });
    },

    /**
     * Renderiza ou atualiza o gráfico de consumo por fabricante.
     * @param {Object} manufacturerData - Dados de consumo por fabricante.
     * @param {string[]} allReagents - Lista de todos os reagentes.
     */
    renderConsumptionByManufacturerChart: (manufacturerData, allReagents) => {
        const sortedByConsumption = Object.entries(manufacturerData).sort(([, a], [, b]) => b.totalConsumption - a.totalConsumption);
        const sortedConsumptionLabels = sortedByConsumption.map(([label]) => label);
        const chartData = {
            labels: sortedConsumptionLabels,
            datasets: allReagents.map(reagent => ({
                label: reagent,
                data: sortedConsumptionLabels.map(manufacturer => manufacturerData[manufacturer].reagents[reagent]),
                backgroundColor: REAGENT_COLORS[reagent]
            }))
        };
        renderers.createOrUpdateChart('consumptionByAssayManufacturerChart', 'bar', chartData, {
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const manufacturer = sortedConsumptionLabels[index];
                    const filterEl = document.getElementById('filter-manufacturer-dashboard');
                    if (filterEl) {
                        filterEl.value = manufacturer;
                        renderers.renderAssaysTables('dashboard');
                        utils.showToast(`Tabela filtrada por: ${manufacturer}`);
                    }
                }
            },
            scales: { x: { stacked: false }, y: { beginAtZero: true } },
            plugins: { datalabels: { display: false } }
        });
    },

    // Em main.js, SUBSTITUA por esta versão
renderCharts: () => {
    // LÊ O FILTRO DE ANO
    const selectedYear = document.getElementById('dashboard-year-filter')?.value;
    
    // FILTRA OS ENSAIOS COM BASE NO ANO
    const allAssays = state.historicalAssays.filter(assay => {
        if (!selectedYear || selectedYear === 'all') return true; // Mostra todos se "Todos os Anos"
        try {
            // Compara o ano do ensaio com o ano selecionado
            return new Date(assay.startDate + 'T00:00:00').getFullYear() == selectedYear;
        } catch (e) {
            return false;
        }
    });

    // O restante das funções agora usará 'allAssays' (a lista filtrada)
    const allReagents = safeObjectKeys(REAGENT_COLORS || {});
    
    // PASSA os dados filtrados para as funções filhas
    const { manufacturerData } = renderers.prepareChartData(allAssays);
    renderers.renderConsumptionByLotChart(allReagents, allAssays); 
    renderers.renderAssaysByManufacturerChart(manufacturerData);
    renderers.renderConsumptionByManufacturerChart(manufacturerData, allReagents);
    renderers.renderAssaysOverTimeChart(allAssays); 
    renderers.renderMonthlyConsumptionChart(allReagents, allAssays); 
    renderers.renderStockByLotChart(allReagents);
},

    /**
     * Cria ou atualiza um gráfico Chart.js.
     * @param {string} canvasId - O ID do elemento canvas.
     * @param {string} type - O tipo de gráfico ('bar', 'line', etc.).
     * @param {Object} data - Os dados do gráfico.
     * @param {Object} options - As opções de configuração do gráfico.
     */
    createOrUpdateChart: (canvasId, type, data, options) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        // Configurar canvas para alta resolução
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.max(window.devicePixelRatio || 1, 2);
        
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        
        // Definir tamanho real do canvas baseado no DPR
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        // Escalar o contexto para compensar o DPR
         const ctx = canvas.getContext('2d');
         ctx.scale(dpr, dpr);
        if (state.charts[canvasId]) {
            state.charts[canvasId].destroy();
        }
        
        // Configurações padrão para todos os gráficos com interatividade melhorada
        const isDarkTheme = document.documentElement.classList.contains('dark');
        const gridColor = isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)';
        const defaultOptions = {
            responsive: true,
            maintainAspectRatio: false,
            devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2), // Força alta resolução
            animation: {
                duration: 750,
                easing: 'easeInOutQuart',
                animateRotate: true,
                animateScale: true
            },
            interaction: {
                mode: 'nearest',
                intersect: false,
                includeInvisible: false
            },
            hover: {
                mode: 'nearest',
                intersect: false,
                animationDuration: 200
            },
            elements: {
                point: {
                    radius: 4,
                    hoverRadius: 8,
                    borderWidth: 2,
                    hoverBorderWidth: 3
                },
                line: {
                    borderWidth: 3,
                    tension: 0.4
                },
                bar: {
                    borderWidth: 1,
                    borderRadius: 4,
                    hoverBorderWidth: 2
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: {
                            size: 12,
                            weight: '500'
                        },
                        color: (document.documentElement.classList.contains('dark') ? '#f8fafc' : '#111'),
                        generateLabels: function(chart) {
                            const original = Chart.defaults.plugins.legend.labels.generateLabels;
                            const labels = original.call(this, chart);
                            labels.forEach(label => {
                                label.borderRadius = 4;
                            });
                            return labels;
                        }
                    },
                    onHover: (event, legendItem, legend) => {
                        legend.chart.canvas.style.cursor = 'pointer';
                    },
                    onLeave: (event, legendItem, legend) => {
                        legend.chart.canvas.style.cursor = 'default';
                    }
                },
                tooltip: {
                    enabled: true,
                    mode: 'nearest',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: true,
                    padding: 12,
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    },
                    animation: {
                        duration: 200
                    },
                    callbacks: {
                        title: function(context) {
                            return context[0].label || '';
                        },
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                // Formatação personalizada baseada no tipo de dado
                                if (context.dataset.label && context.dataset.label.includes('Quantidade')) {
                                    label += Math.round(context.parsed.y) + ' un';
                                } else if (context.dataset.label && context.dataset.label.includes('Consumo')) {
                                    label += Math.round(context.parsed.y) + ' g';
                                } else {
                                    label += Math.round(context.parsed.y);
                                }
                            }
                            return label;
                        },
                        afterLabel: function(context) {
                             // Adiciona informações extras no tooltip
                             const dataset = context.dataset;
                             const total = dataset.data.reduce((a, b) => a + b, 0);
                             const percentage = ((context.parsed.y / total) * 100).toFixed(1);
                             return `Percentual: ${percentage}%`;
                         }
                     }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: true,
                        color: gridColor,
                        lineWidth: 1
                    },
                    ticks: {
                        font: {
                            size: 11
                        },
                        maxRotation: 45,
                        minRotation: 0
                    }
                },
                y: {
                    grid: {
                        display: true,
                        color: gridColor,
                        lineWidth: 1
                    },
                    ticks: {
                        font: {
                            size: 11
                        },
                        callback: function(value) {
                            // Formatação personalizada dos valores do eixo Y
                            if (Number.isInteger(value)) {
                                return value;
                            }
                            return value.toFixed(1);
                        }
                    }
                }
            },
            onHover: (event, activeElements, chart) => {
                // Cursor pointer quando hover sobre elementos
                chart.canvas.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
            },
            onClick: (event, activeElements, chart) => {
                // Funcionalidade de clique nos elementos do gráfico
                if (activeElements.length > 0) {
                    const element = activeElements[0];
                    const datasetIndex = element.datasetIndex;
                    const index = element.index;
                    const dataset = chart.data.datasets[datasetIndex];
                    const value = dataset.data[index];
                    const label = chart.data.labels[index];
                    
                    // Mostra informações detalhadas em um toast
                    notificationSystem.send(
                        'Detalhes do Gráfico',
                        `${dataset.label}: ${value}\nCategoria: ${label}`,
                        'info'
                    );
                }
            },
        };
        // Merge profundo para preservar grid claro em todas as variações
        let mergedOptions = { ...defaultOptions };
        if (options && typeof options === 'object') {
            // Scales
            if (options.scales) {
                mergedOptions.scales = {
                    x: { ...(defaultOptions.scales?.x || {}), ...(options.scales.x || {}) },
                    y: { ...(defaultOptions.scales?.y || {}), ...(options.scales.y || {}) }
                };
            }
            // Plugins
            if (options.plugins) {
                mergedOptions.plugins = { ...(defaultOptions.plugins || {}), ...(options.plugins || {}) };
            }
            // Demais topo
            Object.keys(options).forEach(k => {
                if (k !== 'scales' && k !== 'plugins') {
                    mergedOptions[k] = options[k];
                }
            });
        }
        
        state.charts[canvasId] = new Chart(ctx, { 
            type, 
            data, 
            options: mergedOptions 
        });
        
        // Forçar redimensionamento após criação
        setTimeout(() => {
            if (state.charts[canvasId]) {
                state.charts[canvasId].resize();
            }
        }, 100);
    },
     /**
     * NOVO: Popula os menus <select> de terminais de eficiência.
     * @param {HTMLElement} form - O formulário que contém o select.
     */
    populateTerminalSelects: (form) => {
        const select = form.querySelector('[name="setup"]');
        if (!select) return;

        select.innerHTML = '<option value="">Selecione o Terminal</option>'; // Opção padrão
        state.efficiencyCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            select.appendChild(option);
        });
    },

    /**
     * NOVO: Popula os menus <select> de técnicos de segurança.
     * @param {HTMLElement} form - O formulário que contém o select.
     */
    populateSafetySelects: (form) => {
        const select = form.querySelector('[name="setup"]');
        if (!select) return;

        select.innerHTML = '<option value="">Selecione o Técnico</option>'; // Opção padrão
        state.safetyCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            select.appendChild(option);
        });
    },
    populateSafetyTechnicianSelect: (form) => {
        const select = form.querySelector('[name="safetySetup"]');
        if (!select) return;
        select.innerHTML = '<option value="">Selecione o Técnico</option>';
        state.safetyCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            select.appendChild(option);
        });
    },
    

    /** Popula os filtros de fabricante com os dados disponíveis. */
    populateManufacturerFilter: () => {
        const allAssays = [...state.historicalAssays];
        const manufacturers = [...new Set(allAssays.map(a => a.assayManufacturer))].sort();
        const selects = [
            document.getElementById('filter-manufacturer-dashboard'),
            document.getElementById('filter-manufacturer-assays')
        ];
        selects.forEach(select => {
            if (!select) return;
            const currentValue = select.value;
            select.innerHTML = '<option value="">Todos</option>';
            manufacturers.forEach(manufacturer => {
                const option = document.createElement('option');
                option.value = manufacturer;
                option.textContent = manufacturer;
                select.appendChild(option);
            });
            select.value = currentValue;
        });
    },


    /** Popula os seletores de lote nos modais de ensaio. */
    populateAssayModalLotes: (reagentsUsed = {}) => {
        const populateSelect = (select, reagentName, selectedLots = []) => {
            if (!select) return;
            select.innerHTML = '';
            state.inventory
                .filter(item => item.reagent === reagentName)
                .forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.lot;
                    const unit = item.reagent === 'Tiras de sujidade' ? 'un' : 'g';
                    option.textContent = `${item.lot} (${item.quantity.toLocaleString('pt-BR')} ${unit})`;
                    if (selectedLots.includes(item.lot)) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                });
        };
        populateSelect(document.querySelector('select[name="lotePoBase"]'), 'Pó Base', reagentsUsed['poBase']);
        populateSelect(document.querySelector('select[name="lotePerborato"]'), 'Perborato', reagentsUsed['perborato']);
        populateSelect(document.querySelector('select[name="loteTaed"]'), 'TAED', reagentsUsed['taed']);
        populateSelect(document.querySelector('select[name="loteTiras"]'), 'Tiras de sujidade', reagentsUsed['tiras']);
    },

    /** Popula o formulário de configurações com os valores do estado. */
    populateSettingsForm: () => {
        const thresholdInput = document.getElementById('setting-threshold');
        const calibrationThresholdInput = document.getElementById('setting-calibration-threshold');
        const emailList = document.getElementById('email-list');
        const schedulePasswordInput = DOM.settingSchedulePasswordInput;
        if (thresholdInput) thresholdInput.value = state.settings.alertThreshold;
        if (calibrationThresholdInput) calibrationThresholdInput.value = state.settings.calibrationAlertDays || 30;
        if (schedulePasswordInput) {
            schedulePasswordInput.value = '';
            schedulePasswordInput.placeholder = "Defina ou altere a senha";
        }
        
        // Popula lista de emails gerais
        if (emailList) {
            emailList.innerHTML = '';
            const emails = state.settings.notificationEmail ?
                state.settings.notificationEmail.split(',').filter(e => e) : [];
            if (emails.length > 0) {
                emails.forEach(email => {
                    const li = document.createElement('li');
                    li.className = 'flex justify-between items-center bg-gray-100 p-2 rounded';
                    li.innerHTML = `
                        <span>${email}</span>
                        <div class="flex items-center gap-2">
                            <button class="btn-edit-email text-blue-500 hover:text-blue-700" data-email="${email}" title="Editar">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button class="btn-remove-email text-red-500 hover:text-red-700" data-email="${email}" title="Excluir">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    `;
                    emailList.appendChild(li);
                });
            } else {
                emailList.innerHTML = '<li class="text-gray-500">Nenhum e-mail cadastrado.</li>';
            }
        }
        
        // Renderiza lista de usuários do sistema
        const systemUsersList = document.getElementById('system-users-list');
        if (systemUsersList) {
            systemUsersList.innerHTML = '';
            const systemUsers = state.systemUsers || {};
            const userEntries = Object.entries(systemUsers);
            
            if (userEntries.length > 0) {
                userEntries.forEach(([username, user]) => {
                    const li = document.createElement('li');
                    li.className = 'flex justify-between items-center bg-gray-100 p-3 rounded';
                    
                    const typeLabel = user.type === 'administrador' ? 'Admin' : 'Técnico';
                    const typeColor = user.type === 'administrador' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800';
                    
                    li.innerHTML = `
                        <div class="flex-1">
                            <div class="flex items-center space-x-2">
                                <span class="font-medium">${user.displayName}</span>
                                <span class="px-2 py-1 text-xs rounded-full ${typeColor}">${typeLabel}</span>
                            </div>
                            <div class="text-sm text-gray-600">@${username}</div>
                        </div>
                        ${username !== '10088141' ? `
                        <div class="flex items-center gap-2">
                            <button class="btn-edit-system-user text-blue-500 hover:text-blue-700" data-username="${username}" title="Editar">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button class="btn-remove-system-user text-red-500 hover:text-red-700" data-username="${username}" title="Excluir">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                        ` : '<span class="text-xs text-gray-500">Admin Principal</span>'}
                    `;
                    systemUsersList.appendChild(li);
                });
            } else {
                systemUsersList.innerHTML = '<li class="text-gray-500">Apenas o administrador principal está cadastrado.</li>';
            }
        }
    },
    
    /** Verifica o nível de estoque e exibe um alerta se necessário. */
    checkStockLevel: () => {
        const possibleAssaysResult = calculations.calculatePossibleAssays();
        const possibleAssays = possibleAssaysResult.count || possibleAssaysResult;
        // Debug de alertas removido
        
        const banner = document.getElementById('stock-alert-banner');
        if (!banner) {
            // Banner de alerta não encontrado
            return;
        }
        if (possibleAssays <= state.settings.alertThreshold) {
            const alertText = document.getElementById('stock-alert-text');
            if (alertText) alertText.textContent = `Atenção! Apenas ${possibleAssays} ensaios possíveis. É necessário comprar insumos.`;
            const emailButton = document.getElementById('send-email-button');
            const subject = encodeURIComponent("Alerta de Estoque Baixo de Insumos para Ensaios");
            const body = encodeURIComponent(`O número de ensaios possíveis com o estoque atual atingiu o nível crítico de ${possibleAssays}.\n\nÉ necessário iniciar o processo de compra de novos insumos.\n\nAtenciosamente,\nEquipe EFI-LAV.`);
            if (emailButton) {
                const emailsForOutlook = state.settings.notificationEmail.replace(/,/g, ';');
                emailButton.href = `mailto:${emailsForOutlook}?subject=${subject}&body=${body}`;
            }
            banner.classList.remove('hidden');
            document.body.classList.add('stock-alert-visible');
        } else {
            banner.classList.add('hidden');
            document.body.classList.remove('stock-alert-visible');
        }
    },

    /**
     * Alterna entre as páginas da aplicação com transições suaves.
     * @param {string} pageId - O ID da página a ser exibida.
     */
    switchPage: (pageId) => {
        if (pageId !== 'page-settings') state.isSettingsUnlocked = false;
        
        const overlay = document.getElementById('page-transition-overlay');
        const currentPage = document.querySelector('.page:not(.hidden)');
        const pageToShow = document.getElementById(pageId);
        
        if (!pageToShow) return;
        
        // Mostra overlay de transição
        if (overlay) {
            overlay.classList.add('active');
        }
        
        // Anima saída da página atual
        if (currentPage) {
            currentPage.classList.add('fade-out');
            currentPage.classList.remove('active');
        }
        
        // Aguarda um pouco antes de trocar as páginas
        setTimeout(() => {
            // Remove todas as classes de página ativa
            document.querySelectorAll('.page').forEach(p => {
                p.classList.add('hidden');
                p.classList.remove('active', 'fade-out');
            });
            
            // Mostra nova página
            pageToShow.classList.remove('hidden');
            
            // Pequeno delay para garantir que o DOM foi atualizado
            setTimeout(() => {
                pageToShow.classList.add('active');
                
                // Remove overlay após a transição
                setTimeout(() => {
                    if (overlay) {
                        overlay.classList.remove('active');
                    }
                }, 200);
            }, 50);
        }, 150);
        
        // Atualiza navegação
        document.querySelectorAll('.nav-link').forEach(l => {
            l.classList.remove('bg-blue-600', 'text-white', 'active');
            l.classList.add('text-gray-300', 'hover:bg-gray-700');
        });
        const activeNavLink = document.getElementById(`nav-${pageId.split('-')[1]}`);
        if (activeNavLink) {
            activeNavLink.classList.add('bg-blue-600', 'text-white', 'active');
            activeNavLink.classList.remove('text-gray-300', 'hover:bg-gray-700');
        }
        
        // RESET da flag quando abrimos a página do cronograma
        if (pageId === 'page-schedule' && !state.hasScrolledToToday ) {
            renderers.ganttInitialRenderDone = false;
            renderers.renderGanttChart();
            ui.toggleScheduleActions(state.hasUnsavedChanges);
            setTimeout(() => {
                const today = new Date();
                const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

                const todayCell = DOM.ganttHeaderContainer.querySelector(
                    `.gantt-days-header-row > div[data-date="${todayString}"]`
                );
                if (todayCell) {
                    todayCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
                state.hasScrolledToToday = true; // garante que só roda 1x
            }, 200);
        } else if (pageId === 'page-calibrations') {
            renderers.renderCalibrationsTable();
        }
    }
};
function getBusinessDays(start, end) {
    const days = [];
    const current = new Date(start);
    let dayCount = 0;
    const maxDays = 365; // Proteção contra loops infinitos

    while (current <= end && dayCount < maxDays) {
        const day = current.getDay(); // 0 = domingo, 6 = sábado
        if (day !== 0 && day !== 6) {
            days.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
        dayCount++;
    }
    
    if (dayCount >= maxDays) {
        console.warn('⚠️ getBusinessDays: Loop limitado a', maxDays, 'dias para evitar problemas de performance');
    }
    
    return days;
}

const forecastSystem = {
    charts: {},

    prepareData() {
        // 1. Calcula o estoque inicial, agrupado por "Reagente-Fornecedor"
        const initialStock = {};
        state.inventory.forEach(item => {
            const key = `${item.reagent}-${item.manufacturer}`;
            initialStock[key] = (initialStock[key] || 0) + item.quantity;
        });

        const dailyConsumptions = new Map();
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const limitDate = new Date();
        limitDate.setMonth(limitDate.getMonth() + 3);

        state.scheduledAssays
            .filter(a => {
                const d = new Date(a.startDate);
                // Exclui ensaios de secadora do cálculo de previsão de consumo
                return d >= today && d <= limitDate && a.type !== 'secadora';
            })
            .forEach(assay => {
                const startDate = new Date(assay.startDate + 'T00:00:00');
                const endDate = new Date(assay.endDate + 'T00:00:00');
                const nominalLoad = parseFloat(assay.nominalLoad) || 0;

                const assayConsumptionMap = {
                    poBase: assay.plannedSuppliers?.poBase || 'Swissatest',
                    perborato: 'MHC',
                    taed: assay.plannedSuppliers?.taed || 'Swissatest',
                    tiras: 'Swissatest'
                };

                const dailyConsumption = calculations.calculateConsumption(nominalLoad, 1);
                const businessDays = getBusinessDays(startDate, endDate);

                businessDays.forEach(date => {
                    const dateKey = date.toISOString().split('T')[0];
                    if (!dailyConsumptions.has(dateKey)) {
                        dailyConsumptions.set(dateKey, {});
                    }
                    const dayMap = dailyConsumptions.get(dateKey);

                    Object.keys(assayConsumptionMap).forEach(reagentKey => {
                        const reagentName = REAGENT_NAMES[reagentKey];
                        const manufacturer = assayConsumptionMap[reagentKey];
                        const consumptionKey = `${reagentName}-${manufacturer}`;
                        const amount = dailyConsumption[reagentKey];
                        dayMap[consumptionKey] = (dayMap[consumptionKey] || 0) + amount;
                    });
                });
            });

        const sortedDates = [...dailyConsumptions.keys()].sort();
        const labels = ['Hoje'];
        const timelineData = {};
        Object.keys(initialStock).forEach(key => {
            timelineData[key] = [initialStock[key]];
        });

        let currentStock = { ...initialStock };

        sortedDates.forEach(dateKey => {
            labels.push(new Date(dateKey + 'T00:00:00').toLocaleDateString('pt-BR'));
            const consumptionForTheDay = dailyConsumptions.get(dateKey);

            Object.keys(consumptionForTheDay).forEach(consumptionKey => {
                currentStock[consumptionKey] = (currentStock[consumptionKey] || 0) - consumptionForTheDay[consumptionKey];
            });

            Object.keys(initialStock).forEach(key => {
                timelineData[key].push(Math.max(0, currentStock[key] || 0));
            });
        });

        const finalTimeline = {};
        Object.keys(timelineData).forEach(key => {
            const separatorIndex = key.lastIndexOf('-');
            if (separatorIndex === -1) return;
            
            const reagent = key.substring(0, separatorIndex);
            const manufacturer = key.substring(separatorIndex + 1);
            
            if (!finalTimeline[reagent]) {
                finalTimeline[reagent] = {};
            }
            finalTimeline[reagent][manufacturer] = timelineData[key];
        });

        return { labels, timeline: finalTimeline, initialStock, dailyConsumptions };
    },

    // NOVA FUNÇÃO: Calcula a média de consumo diário com base no histórico.
    calculateHistoricalDailyAverage(reagentName, supplier) {
        const today = new Date();
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(today.getDate() - 90);

        const relevantAssays = state.historicalAssays.filter(assay => {
            const assayDate = new Date(assay.startDate);
            // Exclui ensaios de secadora do cálculo da média histórica
            return assayDate >= ninetyDaysAgo && assayDate <= today && assay.type !== 'secadora';
        });

        if (relevantAssays.length === 0) return 0;

        const totalConsumption = relevantAssays.reduce((total, assay) => {
            if (assay.lots && typeof assay.lots === 'object') {
                const reagentKey = Object.keys(REAGENT_NAMES).find(key => REAGENT_NAMES[key] === reagentName);
                if (assay.lots[reagentKey] && Array.isArray(assay.lots[reagentKey])) {
                    const lotInfo = assay.lots[reagentKey].find(l => {
                        const lotItem = state.inventory.find(inv => inv.lot === l.lot);
                        return lotItem && lotItem.manufacturer === supplier;
                    });
                    if (lotInfo) {
                        const consumption = calculations.calculateConsumption(assay.nominalLoad, lotInfo.cycles);
                        return total + consumption[reagentKey];
                    }
                }
            }
            return total;
        }, 0);

        return totalConsumption / 90; // Média diária sobre o período de 90 dias
    },

    // NOVA FUNÇÃO: Adiciona dias úteis a uma data (excluindo finais de semana)
    addBusinessDays(startDate, businessDaysToAdd) {
        const result = new Date(startDate);
        let daysAdded = 0;
        let totalDays = 0;
        const maxDays = 365; // Proteção contra loops infinitos
        
        while (daysAdded < businessDaysToAdd && totalDays < maxDays) {
            result.setDate(result.getDate() + 1);
            totalDays++;
            const dayOfWeek = result.getDay();
            
            // Se não for sábado (6) nem domingo (0), conta como dia útil
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                daysAdded++;
            }
        }
        
        if (totalDays >= maxDays) {
            console.warn('⚠️ addBusinessDays: Loop limitado a', maxDays, 'dias para evitar problemas de performance');
        }
        
        return result;
    },

    calculateReagentEndDate(reagentName, supplier, initialStock, dailyConsumptions) {
        const stockKey = `${reagentName}-${supplier}`;
        let currentStock = initialStock[stockKey] || 0;
    
        if (currentStock <= 0) return "Estoque já esgotado";
    
        const sortedDates = [...dailyConsumptions.keys()].sort();
        let lastDate = new Date();
    
        // 1. Simulação baseada no cronograma (excluindo secadoras)
        for (const dateKey of sortedDates) {
            const consumptionOnDay = dailyConsumptions.get(dateKey)[stockKey] || 0;
            currentStock -= consumptionOnDay;
            lastDate = new Date(dateKey + 'T00:00:00');
            if (currentStock <= 0) {
                return `Aproximadamente em ${lastDate.toLocaleDateString('pt-BR')}`;
            }
        }
    
        // 2. Após o último ensaio agendado, simula laboratório com 8 terminais ocupados (13kg cada)
        if (sortedDates.length > 0) {
            // Calcula consumo diário com 8 terminais de 13kg cada
            const dailyConsumptionWith8Terminals = calculations.calculateConsumption(13, 1);
            const reagentKey = Object.keys(REAGENT_NAMES).find(key => REAGENT_NAMES[key] === reagentName);
            const dailyConsumptionAmount = dailyConsumptionWith8Terminals[reagentKey] * 8; // 8 terminais
            
            if (dailyConsumptionAmount > 0) {
                const businessDaysRemaining = Math.floor(currentStock / dailyConsumptionAmount);
                // Usa apenas dias úteis para calcular a data final
                const endDate = this.addBusinessDays(lastDate, businessDaysRemaining);
                return `Estimado para ${endDate.toLocaleDateString('pt-BR')}`;
            }
        }
    
        // 3. Fallback: usa a média histórica se não há ensaios agendados
        const averageDailyConsumption = this.calculateHistoricalDailyAverage(reagentName, supplier);
    
        if (averageDailyConsumption > 0) {
            const businessDaysRemaining = Math.floor(currentStock / averageDailyConsumption);
            // Usa apenas dias úteis para calcular a data final
            const endDate = this.addBusinessDays(lastDate, businessDaysRemaining);
            return `Estimado para ${endDate.toLocaleDateString('pt-BR')}`;
        }
    
        return "Não se esgota (sem consumo)";
    },
    
    renderEndDateForecasts() {
        const { initialStock, dailyConsumptions } = this.prepareData();
    
        const reagentMap = {
            'poBase': { name: 'Pó Base', supplier: 'Swissatest' },
            'perborato': { name: 'Perborato', supplier: 'MHC' },
            'taed': { name: 'TAED', supplier: 'Swissatest' },
            'tiras': { name: 'Tiras de sujidade', supplier: 'Swissatest' }
        };
    
        for (const key in reagentMap) {
            const { name, supplier } = reagentMap[key];
            const endDateText = this.calculateReagentEndDate(name, supplier, initialStock, dailyConsumptions);
            
            const element = document.getElementById(`end-date-${key}`);
            if (element) {
                element.innerHTML = `📅 Fim do estoque: <strong>${endDateText}</strong>`;
            }
        }
    },

    // Função não modificada
    renderChart(canvasId, reagentName, reagentData, labels) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Configurar canvas para alta resolução
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(window.devicePixelRatio || 1, 2);

    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";

    // Definir tamanho real do canvas baseado no DPR
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    // Escalar o contexto para compensar o DPR
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // Destroi gráfico antigo, se existir
    if (this.charts[canvasId]) {
        this.charts[canvasId].destroy();
    }

    const datasets = Object.entries(reagentData).map(([manufacturer, values]) => {
        const color = SUPPLIER_COLORS[manufacturer] || SUPPLIER_COLORS["Default"];
        return {
            label: manufacturer,
            data: values,
            borderColor: color,
            backgroundColor: color,
            fill: false,
            tension: 0.2,
            pointRadius: 4,
            pointHoverRadius: 6
        };
    });

    // Criar gráfico
    this.charts[canvasId] = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            devicePixelRatio: dpr,
            plugins: {
                legend: {
                    display: true,
                    position: "bottom",
                    labels: {
                        font: { size: 13, weight: "600" },
                        color: (document.documentElement.classList.contains('dark') ? '#f8fafc' : '#111')
                    }
                },
                datalabels: {
                    display: false
                },
                tooltip: {
                    mode: "index",
                    intersect: false,
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${ctx.raw.toFixed(0)}`
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: "Data"
                    },
                    ticks: {
                        autoSkip: true,
                        maxRotation: 45,
                        minRotation: 0
                    },
                    grid: {
                        display: true,
                        color: (document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)'),
                        lineWidth: 1
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: "Estoque Disponível"
                    },
                    beginAtZero: true,
                    grid: {
                        display: true,
                        color: (document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)'),
                        lineWidth: 1
                    }
                }
            }
        }
    });
    },

    renderAll() {
        const { labels, timeline } = this.prepareData();
        const reagentToCanvasMap = {
            'Pó Base': 'chart-poBase',
            'Perborato': 'chart-perborato',
            'TAED': 'chart-taed',
            'Tiras de sujidade': 'chart-tiras'
        };

        for (const reagentName in timeline) {
            const canvasId = reagentToCanvasMap[reagentName];
            if (canvasId) {
                this.renderChart(canvasId, reagentName, timeline[reagentName], labels);
            }
        }
        
        // ADICIONADO AQUI:
        this.renderEndDateForecasts();
    }
};
/**
 * VERSÃO FINAL COM CONSUMO MENSAL POR FORNECEDOR
 * Projeta o consumo mensal para os próximos 6 meses, baseado no histórico
 * do último ano, agrupado por fornecedor.
 */
const historicalForecastSystem = {
    /**
     * Ponto de entrada principal. Orquestra o cálculo e a renderização.
     */
    render: function() {
        const historicalConsumption = this.calculateHistoricalConsumptionBySupplier();

        if (!historicalConsumption) {
            utils.showToast("Não há dados históricos suficientes para gerar uma previsão por fornecedor.", true);
            return;
        }

        const chartReadyData = this.prepareChartData(historicalConsumption);
        
        Object.keys(chartReadyData).forEach(reagentName => {
            const chartInfo = chartReadyData[reagentName];
            this.renderConsumptionChart(chartInfo.canvasId, chartInfo.data);
        });

        this.updateUI('history');
    },

    /**
     * NOVA FUNÇÃO DEDICADA: Renderiza um gráfico de barras empilhadas para o consumo.
     */
    renderConsumptionChart: function(canvasId, chartData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Configurar canvas para alta resolução
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(window.devicePixelRatio || 1, 2);

    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // Destruir gráfico antigo se já existir
    if (forecastSystem.charts[canvasId]) {
        forecastSystem.charts[canvasId].destroy();
    }

    const isDarkLegend = document.documentElement.classList.contains('dark');
    const legendTextColor = isDarkLegend ? '#ffffff' : '#111';
    forecastSystem.charts[canvasId] = new Chart(ctx, {
        type: "bar",
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            devicePixelRatio: dpr,
            plugins: {
                legend: { 
                    display: true, 
                    position: "bottom",
                    labels: {
                        font: { size: 13, weight: "600" },
                        color: legendTextColor
                    }
                },
                title: { 
                    display: true, 
                    text: "Consumo Mensal Projetado",
                    font: { size: 15, weight: "700" },
                    color: legendTextColor
                },
                tooltip: {
                    mode: "index",
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) {
                                if (context.dataset.label && context.dataset.label.includes('Quantidade')) {
                                    label += Math.round(context.parsed.y) + ' un';
                                } else if (context.dataset.label && context.dataset.label.includes('Consumo')) {
                                    label += Math.round(context.parsed.y) + ' g';
                                } else {
                                    label += Math.round(context.parsed.y);
                                }
                            }
                            return label;
                        }
                    }
                },
                datalabels: { display: false }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: "Mês da Projeção" },
                    ticks: {
                        autoSkip: true,
                        maxRotation: 45,
                        minRotation: 0
                    },
                    grid: {
                        display: true,
                        color: (document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)'),
                        lineWidth: 1
                    }
                },
                y: {
                    stacked: true,
                    title: { display: true, text: "Consumo Projetado (g ou un)" },
                    beginAtZero: true,
                    grid: {
                        display: true,
                        color: (document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)'),
                        lineWidth: 1
                    }
                }
            }
        }
    });
    },

    /**
     * CORRIGIDO: Calcula o consumo mensal do ano anterior, agora agrupado por reagente E fornecedor.
     */
    calculateHistoricalConsumptionBySupplier: function() {
        // 1. Cria um mapa de Lote -> Fornecedor para consulta rápida
        const lotToSupplierMap = new Map();
        state.inventory.forEach(item => lotToSupplierMap.set(item.lot, item.manufacturer));

        // 2. Define o período histórico (últimos 6 meses completos do ano anterior)
        const today = new Date();
        const historicalStartDate = new Date(today.getFullYear() - 1, today.getMonth(), 1);
        const historicalEndDate = new Date(today.getFullYear() - 1, today.getMonth() + 6, 0);

        const historicalAssays = state.historicalAssays.filter(assay => {
            const assayDate = new Date(assay.startDate + 'T00:00:00');
            return assayDate >= historicalStartDate && assayDate <= historicalEndDate;
        });

        if (historicalAssays.length === 0) return null;
        
        const monthlyConsumption = {}; // Ex: { "2024-10": { "Pó Base": { "Swissatest": 5000 } } }

        // 3. Itera sobre os ensaios históricos para agregar o consumo
        historicalAssays.forEach(assay => {
            const assayDate = new Date(assay.startDate + 'T00:00:00');
            const monthKey = `${assayDate.getFullYear()}-${String(assayDate.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyConsumption[monthKey]) monthlyConsumption[monthKey] = {};

            if (assay.lots && typeof assay.lots === 'object') {
                Object.keys(assay.lots).forEach(reagentKey => {
                    const lotsArray = assay.lots[reagentKey];
                    if (Array.isArray(lotsArray)) {
                        lotsArray.forEach(lotEntry => {
                            const supplier = lotToSupplierMap.get(lotEntry.lot) || 'Desconhecido';
                            const consumption = calculations.calculateConsumption(assay.nominalLoad, lotEntry.cycles);
                            const reagentName = REAGENT_NAMES[reagentKey];

                            if (reagentName) {
                                // Inicializa as estruturas aninhadas se não existirem
                                if (!monthlyConsumption[monthKey][reagentName]) monthlyConsumption[monthKey][reagentName] = {};
                                if (!monthlyConsumption[monthKey][reagentName][supplier]) monthlyConsumption[monthKey][reagentName][supplier] = 0;
                                
                                // Soma o consumo
                                monthlyConsumption[monthKey][reagentName][supplier] += consumption[reagentKey];
                            }
                        });
                    }
                });
            }
        });

        return monthlyConsumption;
    },
    
    /**
     * CORRIGIDO: Prepara os dados para os gráficos de barras empilhadas de consumo.
     */
    prepareChartData: function(historicalConsumption) {
        const today = new Date();
        const labels = [];
        for (let i = 0; i < 6; i++) {
            const futureMonth = new Date(today.getFullYear(), today.getMonth() + i, 1);
            labels.push(futureMonth.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }));
        }

        const allReagents = ['Pó Base', 'Perborato', 'TAED', 'Tiras de sujidade'];
        const allSuppliers = [...new Set(state.inventory.map(i => i.manufacturer))];
        const result = {};

        const reagentToCanvasMap = {
            'Pó Base': 'chart-poBase',
            'Perborato': 'chart-perborato',
            'TAED': 'chart-taed',
            'Tiras de sujidade': 'chart-tiras'
        };

        allReagents.forEach(reagentName => {
            const datasets = [];
            allSuppliers.forEach(supplier => {
                const data = [];
                for (let i = 0; i < 6; i++) {
                    const futureMonth = new Date(today.getFullYear(), today.getMonth() + i, 1);
                    const historicalMonthKey = `${futureMonth.getFullYear() - 1}-${String(futureMonth.getMonth() + 1).padStart(2, '0')}`;
                    
                    // Busca o valor de consumo. Se não existir, é 0.
                    const consumptionValue = historicalConsumption[historicalMonthKey]?.[reagentName]?.[supplier] || 0;
                    data.push(consumptionValue);
                }

                // Só adiciona o dataset se houver algum consumo para este fornecedor
                if (data.some(value => value > 0)) {
                    datasets.push({
                        label: supplier,
                        data: data,
                        backgroundColor: SUPPLIER_COLORS[supplier] || SUPPLIER_COLORS['Default'],
                    });
                }
            });

            result[reagentName] = {
                canvasId: reagentToCanvasMap[reagentName],
                data: {
                    labels: labels,
                    datasets: datasets
                }
            };
        });
        
        return result;
    },

    updateUI: function(mode) {
        const btnSchedule = document.getElementById('btn-forecast-schedule');
        const btnHistory = document.getElementById('btn-forecast-history');
        if (!btnSchedule || !btnHistory) return;

        if (mode === 'history') {
            btnHistory.classList.replace('bg-gray-200', 'bg-blue-600');
            btnHistory.classList.replace('text-gray-800', 'text-white');
            btnSchedule.classList.replace('bg-blue-600', 'bg-gray-200');
            btnSchedule.classList.replace('text-white', 'text-gray-800');
        } else {
            btnSchedule.classList.replace('bg-gray-200', 'bg-blue-600');
            btnSchedule.classList.replace('text-gray-800', 'text-white');
            btnHistory.classList.replace('bg-blue-600', 'bg-gray-200');
            btnHistory.classList.replace('text-white', 'text-gray-800');
        }
    },
    
    init: function() {
        document.getElementById('btn-forecast-schedule')?.addEventListener('click', () => {
            forecastSystem.renderAll();
            this.updateUI('schedule');
        });
        document.getElementById('btn-forecast-history')?.addEventListener('click', () => {
            this.render();
        });
    }
};
const ganttMiddleClickHandler = (e) => {
    // Confirma que foi o botão do meio (scroll) que foi pressionado
    if (e.button !== 1) {
        return;
    }

    // Previne comportamentos padrão do navegador, como o auto-scroll
    e.preventDefault();

    const target = e.target.closest('.gantt-event');
    if (!target) {
        return; // O clique não foi em uma tarefa
    }

    const assayId = parseInt(target.dataset.assayId, 10);
    if (isNaN(assayId)) {
        return;
    }

    // Encontra o ensaio e sua localização (em qual array e em qual índice)
    let assay = null;
    let sourceArray = null;
    let assayIndex = -1;
    let isSafetyAssay = false;

    // Procura primeiro nos ensaios de eficiência
    assayIndex = state.scheduledAssays.findIndex(a => a.id === assayId);
    if (assayIndex !== -1) {
        assay = state.scheduledAssays[assayIndex];
        sourceArray = state.scheduledAssays;
    } else {
        // Se não encontrou, procura nos ensaios de segurança
        assayIndex = state.safetyScheduledAssays.findIndex(a => a.id === assayId);
        if (assayIndex !== -1) {
            assay = state.safetyScheduledAssays[assayIndex];
            sourceArray = state.safetyScheduledAssays;
            isSafetyAssay = true;
        }
    }

    if (!assay) {
        utils.showToast("Erro: Tarefa não encontrada.", true);
        return;
    }

    // Validações para não mover itens que não devem ser movidos
    if (assay.type === 'férias') {
        utils.showToast("Não é possível mover 'Férias' para pendentes.", true);
        return;
    }
    if (assay.status === 'pendente') {
        utils.showToast("Esta tarefa já está em Pendentes.", true);
        return;
    }

    // Salva o estado atual para permitir a funcionalidade de "Desfazer" (Ctrl+Z)
    undoManager.saveState();

    // Modifica os dados do ensaio para refletir o novo estado "Pendente"
    assay.status = 'pendente';
    assay.setup = null; // Ensaios pendentes não têm um terminal/responsável atribuído

    // Se o ensaio era de segurança, mover apenas no estado local para a lista de eficiência
    if (isSafetyAssay) {
        const [movedAssay] = sourceArray.splice(assayIndex, 1);
        state.scheduledAssays.push(movedAssay);
    }

    // Atualiza a interface do usuário sem persistir imediatamente
    state.hasUnsavedChanges = true;
    ui.toggleScheduleActions(true);
    renderers.renderGanttChart();
    utils.showToast(`Tarefa '${assay.protocol}' movida para Pendentes. Clique em Guardar Alterações para aplicar.`);
};
/**
 * Funções para manipulação de dados, incluindo interações com a extensão VS Code.
 */
const dataHandlers = {
    updateScheduledAssayGranular: (id, updates) => {
        window.vscode?.postMessage({
            command: 'updateScheduledAssayGranular',
            data: { id, updates }
        });
    },
    deleteScheduledAssayGranular: (id) => {
        window.vscode?.postMessage({
            command: 'deleteScheduledAssayGranular',
            data: { id }
        });
    },
    updateSafetyScheduledAssayGranular: (id, updates) => {
        window.vscode?.postMessage({
            command: 'updateSafetyScheduledAssayGranular',
            data: { id, updates }
        });
    },
    deleteSafetyScheduledAssayGranular: (id) => {
        window.vscode?.postMessage({
            command: 'deleteSafetyScheduledAssayGranular',
            data: { id }
        });
    },
    deleteHistoricalAssayGranular: (id) => {
        window.vscode?.postMessage({
            command: 'deleteHistoricalAssayGranular',
            data: { id }
        });
    },
    /** Salva o estado atual da aplicação. */
    saveData: () => {
        // Iniciando processo de salvamento
        
        // Verificando equipamentos em calibração
        const equipmentsInCalibration = state.calibrationEquipments.filter(eq => eq.calibrationStatus === 'em_calibracao');
        
        // Invalida caches relacionados a dados
        cacheSystem.rendering.invalidateOnDataChange();
        
        // Log para debug do salvamento do inventário
        console.log('[INVENTORY] Preparando para salvar inventário...');
        console.log('[INVENTORY] Itens no estado atual:', state.inventory?.length || 0);
        
        const dataToSave = {
            inventory: state.inventory,
            historicalAssays: state.historicalAssays,
            scheduledAssays: state.scheduledAssays,
            safetyScheduledAssays: state.safetyScheduledAssays, // Inclui a nova array
            holidays: state.holidays,
            calibrations: state.calibrations,
            calibrationEquipments: state.calibrationEquipments,
            settings: state.settings,
            efficiencyCategories: state.efficiencyCategories,
            safetyCategories: state.safetyCategories,
            systemUsers: state.systemUsers,
        };
        try {
            JSON.stringify(dataToSave);
            // Teste de serialização passou
        } catch (error) {
            console.error('[WEBVIEW] ERRO FATAL: Os dados contêm uma referência circular e não podem ser salvos!', error);
            utils.showToast('ERRO GRAVE: Os dados não puderam ser serializados. Verifique o console.', true);
            return;
        }
        // Processando equipamentos de calibração para salvamento
        console.log('[SAVE] Equipamentos de calibração sendo salvos:', 
            state.calibrationEquipments.map(eq => ({
                tag: eq.tag,
                calibrationStatus: eq.calibrationStatus,
                lastCalibrationDate: eq.lastCalibrationDate,
                calibrationStartDate: eq.calibrationStartDate
            }))
        );
        
            window.vscode?.postMessage({
            command: 'saveData',
            data: dataToSave
        });
        // Dados enviados para extensão
        
        // Atualizar dashboard automaticamente quando algo for alterado no cronograma
        if (document.getElementById('dashboard-page') && !document.getElementById('dashboard-page').classList.contains('hidden')) {
            renderers.renderDashboard();
        }
    },

    /**
     * Função otimizada para alterar apenas o status de um ensaio específico
     * @param {number} assayId - ID do ensaio
     * @param {string} newStatus - Novo status
     * @param {string} table - Tabela ('scheduled_assays' ou 'safety_scheduled_assays')
     */
    updateAssayStatusOnly: (assayId, newStatus, table = 'scheduled_assays') => {
        console.log(`[WEBVIEW] Alterando status do ensaio ${assayId} para '${newStatus}' na tabela ${table}`);
        
            window.vscode?.postMessage({
            command: 'updateAssayStatusOnly',
            data: {
                assayId: assayId,
                status: newStatus,
                table: table
            }
        });
    },

    /**
     * Função otimizada para operações de inventário
     */
    addInventoryItem: (item) => {
        console.log('[WEBVIEW] Adicionando item ao inventário:', item);
        
        // Validação básica antes de enviar
        if (!item || typeof item !== 'object') {
            console.error('[WEBVIEW] Item inválido:', item);
            notificationSystem.send('Erro', 'Dados do item são inválidos', 'error');
            return;
        }

        // Verificar campos obrigatórios
        const requiredFields = ['reagent', 'manufacturer', 'lot', 'quantity', 'validity'];
        const missingFields = requiredFields.filter(field => !item[field]);
        
        if (missingFields.length > 0) {
            console.error('[WEBVIEW] Campos obrigatórios ausentes:', missingFields);
            notificationSystem.send('Erro', `Campos obrigatórios ausentes: ${missingFields.join(', ')}`, 'error');
            return;
        }

            window.vscode?.postMessage({
            command: 'addInventoryItem',
            data: {
                item: item  // Envolvendo o item em um objeto data
            }
        });
    },

    updateInventoryItem: (item) => {
        console.log('[WEBVIEW] Atualizando item do inventário:', item);
            window.vscode?.postMessage({
            command: 'updateInventoryItem',
            data: item
        });
    },

    deleteInventoryItem: (itemId) => {
        console.log('[WEBVIEW] Removendo item do inventário:', itemId);
            window.vscode?.postMessage({
            command: 'deleteInventoryItem',
            data: { id: itemId }
        });
    },

    // ==================== OPERAÇÕES GRANULARES PARA INVENTÁRIO ====================

    /**
     * Operações granulares para inventário
     */
    createInventoryItemGranular: (item) => {
        console.log('[WEBVIEW] Criando item do inventário (granular):', item);
        
        if (!item || typeof item !== 'object') {
            console.error('[WEBVIEW] Item inválido:', item);
            notificationSystem.send('Erro', 'Dados do item são inválidos', 'error');
            return;
        }

        const requiredFields = ['reagent', 'manufacturer', 'lot', 'quantity', 'validity'];
        const missingFields = requiredFields.filter(field => !item[field]);
        
        if (missingFields.length > 0) {
            console.error('[WEBVIEW] Campos obrigatórios ausentes:', missingFields);
            notificationSystem.send('Erro', `Campos obrigatórios ausentes: ${missingFields.join(', ')}`, 'error');
            return;
        }

            window.vscode?.postMessage({
            command: 'createInventoryItemGranular',
            data: item
        });
    },

    getInventoryItemById: (itemId) => {
        console.log('[WEBVIEW] Buscando item do inventário por ID:', itemId);
            window.vscode?.postMessage({
            command: 'getInventoryItemById',
            data: { id: itemId }
        });
    },

    getAllInventoryItemsGranular: () => {
        console.log('[WEBVIEW] Buscando todos os itens do inventário (granular)');
            window.vscode?.postMessage({
            command: 'getAllInventoryItemsGranular',
            data: {}
        });
    },

    getLowStockItems: () => {
        console.log('[WEBVIEW] Buscando itens com estoque baixo');
            window.vscode?.postMessage({
            command: 'getLowStockItems',
            data: {}
        });
    },

    updateInventoryItemGranular: (itemId, updates) => {
        console.log('[WEBVIEW] Atualizando item do inventário (granular):', itemId, updates);
            window.vscode?.postMessage({
            command: 'updateInventoryItemGranular',
            data: { id: itemId, updates: updates }
        });
    },

    updateInventoryQuantity: (itemId, quantity) => {
        console.log('[WEBVIEW] Atualizando quantidade do inventário:', itemId, quantity);
            window.vscode?.postMessage({
            command: 'updateInventoryQuantity',
            data: { id: itemId, quantity: quantity }
        });
    },

    deleteInventoryItemGranular: (itemId) => {
        console.log('[WEBVIEW] Removendo item do inventário (granular):', itemId);
            window.vscode?.postMessage({
            command: 'deleteInventoryItemGranular',
            data: { id: itemId }
        });
    },

    // ==================== OPERAÇÕES GRANULARES PARA ENSAIOS AGENDADOS ====================

    /**
     * Operações granulares para ensaios agendados
     */
    createScheduledAssay: (assayData) => {
        console.log('[WEBVIEW] Criando ensaio agendado:', assayData);
            window.vscode?.postMessage({
            command: 'createScheduledAssay',
            data: assayData
        });
    },

    createSafetyScheduledAssay: (assayData) => {
        console.log('[WEBVIEW] Criando ensaio de segurança agendado:', assayData);
            window.vscode?.postMessage({
            command: 'createSafetyScheduledAssay',
            data: assayData
        });
    },

    getScheduledAssayById: (assayId) => {
        console.log('[WEBVIEW] Buscando ensaio agendado por ID:', assayId);
        vscode.postMessage({
            command: 'getScheduledAssayById',
            data: { id: assayId }
        });
    },

    getAllScheduledAssays: () => {
        console.log('[WEBVIEW] Buscando todos os ensaios agendados');
        vscode.postMessage({
            command: 'getAllScheduledAssays',
            data: {}
        });
    },

    updateScheduledAssayGranular: (assayId, updates) => {
        console.log('[WEBVIEW] Atualizando ensaio agendado (granular):', assayId, updates);
        vscode.postMessage({
            command: 'updateScheduledAssayGranular',
            data: { id: assayId, updates: updates }
        });
    },

    deleteScheduledAssayGranular: (assayId) => {
        console.log('[WEBVIEW] Removendo ensaio agendado (granular):', assayId);
        vscode.postMessage({
            command: 'deleteScheduledAssayGranular',
            data: { id: assayId }
        });
    },

    // ==================== OPERAÇÕES GRANULARES PARA CALIBRAÇÕES ====================

    /**
     * Operações granulares para calibrações
     */
    createCalibration: (calibrationData) => {
        console.log('[WEBVIEW] Criando calibração:', calibrationData);
        vscode.postMessage({
            command: 'createCalibration',
            data: calibrationData
        });
    },

    getCalibrationById: (calibrationId) => {
        console.log('[WEBVIEW] Buscando calibração por ID:', calibrationId);
        vscode.postMessage({
            command: 'getCalibrationById',
            data: { id: calibrationId }
        });
    },

    getAllCalibrations: () => {
        console.log('[WEBVIEW] Buscando todas as calibrações');
        vscode.postMessage({
            command: 'getAllCalibrations',
            data: {}
        });
    },

    getUpcomingCalibrations: (daysAhead = 30) => {
        console.log('[WEBVIEW] Buscando calibrações próximas:', daysAhead);
        vscode.postMessage({
            command: 'getUpcomingCalibrations',
            data: { daysAhead: daysAhead }
        });
    },

    updateCalibrationGranular: (calibrationId, updates) => {
        console.log('[WEBVIEW] Atualizando calibração (granular):', calibrationId, updates);
        vscode.postMessage({
            command: 'updateCalibrationGranular',
            data: { id: calibrationId, updates: updates }
        });
    },

    deleteCalibrationGranular: (calibrationId) => {
        console.log('[WEBVIEW] Removendo calibração (granular):', calibrationId);
        vscode.postMessage({
            command: 'deleteCalibrationGranular',
            data: { id: calibrationId }
        });
    },

    /**
     * Função otimizada para operações de feriados
     */
    addHoliday: (holiday) => {
        undoManager.saveState();
        const newHoliday = { id: Date.now(), ...holiday };
        state.holidays.push(newHoliday);
        state.hasUnsavedChanges = true;
        ui.toggleScheduleActions(true);
        renderers.renderGanttChart();
        renderers.renderHolidaysList();
        utils.showToast('Feriado adicionado (pendente de salvar).');
    },

    deleteHoliday: (holidayId) => {
        undoManager.saveState();
        const beforeLen = state.holidays.length;
        state.holidays = state.holidays.filter(h => Number(h.id) !== Number(holidayId));
        if (state.holidays.length !== beforeLen) {
            state.hasUnsavedChanges = true;
            ui.toggleScheduleActions(true);
            renderers.renderGanttChart();
            renderers.renderHolidaysList();
            utils.showToast('Feriado removido (pendente de salvar).');
        }
    },
    updateHoliday: (holiday) => {
        undoManager.saveState();
        const idx = state.holidays.findIndex(h => Number(h.id) === Number(holiday.id));
        if (idx !== -1) {
            state.holidays[idx] = { ...state.holidays[idx], ...holiday };
            state.hasUnsavedChanges = true;
            ui.toggleScheduleActions(true);
            renderers.renderGanttChart();
            renderers.renderHolidaysList();
            utils.showToast('Feriado atualizado (pendente de salvar).');
        }
    },
    addScheduleEvent: (event) => {
        undoManager.saveState();
        const newEvent = { id: Date.now(), ...event };
        state.events.push(newEvent);
        state.hasUnsavedChanges = true;
        ui.toggleScheduleActions(true);
        renderers.renderGanttChart();
    },
    updateScheduleEvent: (event) => {
        undoManager.saveState();
        const idx = state.events.findIndex(e => Number(e.id) === Number(event.id));
        if (idx !== -1) {
            state.events[idx] = { ...state.events[idx], ...event };
            state.hasUnsavedChanges = true;
            ui.toggleScheduleActions(true);
            renderers.renderGanttChart();
        }
    },
    deleteScheduleEvent: (eventId) => {
        undoManager.saveState();
        const beforeLen = state.events.length;
        state.events = state.events.filter(e => Number(e.id) !== Number(eventId));
        if (state.events.length !== beforeLen) {
            state.hasUnsavedChanges = true;
            ui.toggleScheduleActions(true);
            renderers.renderGanttChart();
            utils.showToast('Evento removido do cronograma (pendente de salvar).');
        }
    },
    deleteHolidayLocal: (holidayId) => {
        undoManager.saveState();
        const beforeLen = state.holidays.length;
        state.holidays = state.holidays.filter(h => Number(h.id) !== Number(holidayId));
        if (state.holidays.length !== beforeLen) {
            state.hasUnsavedChanges = true;
            ui.toggleScheduleActions(true);
            renderers.renderGanttChart();
            renderers.renderHolidaysList();
            utils.showToast('Feriado removido (pendente de salvar).');
        }
    },
    // (Mantido apenas o modo local, sem envio imediato)

    handleAddScheduleEvent: (e) => {
        e.preventDefault();
        const form = e.target;
        const title = form.title.value.trim();
        const type = form.type.value.trim();
        const description = form.description.value.trim();
        const startDate = form.startDate.value;
        const endDate = form.endDate.value;
        if (!title || !type || !startDate || !endDate) return;
        const payload = { title, type, description, startDate, endDate };
        dataHandlers.addScheduleEvent(payload);
        utils.closeModal();
    },
    handleUpdateScheduleEvent: (e) => {
        e.preventDefault();
        const form = e.target;
        const id = parseInt(form.id.value, 10);
        if (isNaN(id)) return;
        const updates = {
            id,
            title: form.title.value.trim(),
            type: form.type.value.trim(),
            description: form.description.value.trim(),
            startDate: form.startDate.value,
            endDate: form.endDate.value
        };
        dataHandlers.updateScheduleEvent(updates);
        utils.closeModal();
    },

    /**
     * Função otimizada para operações de usuários do sistema
     */
    addSystemUser: (user) => {
        console.log('[WEBVIEW] Adicionando usuário do sistema:', user);
        vscode.postMessage({
            command: 'addSystemUser',
            data: user
        });
    },

    updateSystemUser: (username, updates) => {
        console.log('[WEBVIEW] Atualizando usuário do sistema:', username, updates);
        vscode.postMessage({
            command: 'updateSystemUser',
            data: { id: username, updates }
        });
    },

    deleteSystemUser: (userId) => {
        console.log('[WEBVIEW] Removendo usuário do sistema:', userId);
        vscode.postMessage({
            command: 'deleteSystemUser',
            data: { id: userId }
        });
    },

    /**
     * Função otimizada para operações de categorias
     */
    addScheduleCategory: (category, type) => {
        console.log('[WEBVIEW] Adicionando categoria:', category, 'tipo:', type);
        const isSafety = type === 'safety';
        vscode.postMessage({
            command: 'addCategory',
            data: { category, isSafety }
        });
    },

    deleteScheduleCategory: (categoryId, type) => {
        console.log('[WEBVIEW] Removendo categoria:', categoryId, 'tipo:', type);
        const isSafety = type === 'safety';
        vscode.postMessage({
            command: 'deleteCategory',
            data: { id: categoryId, isSafety }
        });
    },

    /**
     * Função otimizada para salvar cronograma completo
     */
    saveScheduleData: () => {
        console.log('[WEBVIEW] Salvando dados do cronograma...');
        
        // Processa ensaios pendentes para adicionar ao histórico
        if (state.pendingHistoricalAssays && state.pendingHistoricalAssays.length > 0) {
            const pendingCount = state.pendingHistoricalAssays.length;
            console.log('[WEBVIEW] Adicionando ensaios finalizados ao histórico:', pendingCount);
            
            // Adiciona os ensaios pendentes ao histórico
            state.historicalAssays.push(...state.pendingHistoricalAssays);
            
            // Remove as flags pendingHistoryAdd dos ensaios no cronograma
            state.scheduledAssays.forEach(assay => {
                if (assay.pendingHistoryAdd) {
                    delete assay.pendingHistoryAdd;
                    delete assay.previousStatus; // Remove o status anterior após confirmar
                }
            });
            
            state.safetyScheduledAssays.forEach(assay => {
                if (assay.pendingHistoryAdd) {
                    delete assay.pendingHistoryAdd;
                    delete assay.previousStatus; // Remove o status anterior após confirmar
                }
            });
            
            // Limpa a lista de ensaios pendentes
            state.pendingHistoricalAssays = [];
            
            utils.showToast(`${pendingCount} ensaio(s) adicionado(s) ao histórico.`);
        }
        
        // Processa descontos de insumos pendentes
        let stockDeductionCount = 0;
        state.scheduledAssays.forEach(assay => {
            if (assay.pendingStockDeduction) {
                console.log(`[WEBVIEW] Processando desconto de insumos para ensaio ${assay.id}`);
                
                // Executa o desconto de cada reagente
                const deduction = assay.pendingStockDeduction;
                checkAndDeductStock('poBase', deduction.poBase, deduction.nominalLoad);
                checkAndDeductStock('perborato', deduction.perborato, deduction.nominalLoad);
                checkAndDeductStock('taed', deduction.taed, deduction.nominalLoad);
                checkAndDeductStock('tiras', deduction.tiras, deduction.nominalLoad);
                
                // Remove a flag após processar
                delete assay.pendingStockDeduction;
                stockDeductionCount++;
            }
        });
        
        if (stockDeductionCount > 0) {
            utils.showToast(`Insumos descontados para ${stockDeductionCount} ensaio(s).`);
        }
        
        const scheduleData = {
            scheduledAssays: state.scheduledAssays,
            safetyScheduledAssays: state.safetyScheduledAssays,
            calibrations: state.calibrations,
            efficiencyCategories: state.efficiencyCategories,
            safetyCategories: state.safetyCategories,
            historicalAssays: state.historicalAssays,
            inventory: state.inventory,
            holidays: state.holidays,
            events: state.events
        };
        
        vscode.postMessage({
            command: 'saveScheduleData',
            data: scheduleData
        });
    },

    /**
     * Função otimizada para atualizar configurações do sistema
     */
    updateSystemSettings: (settings) => {
        console.log('[WEBVIEW] Atualizando configurações do sistema:', settings);
        vscode.postMessage({
            command: 'updateSettings',
            data: settings
        });
    },
    /**
     * Lida com a submissão do formulário para adicionar novas linhas ao Gantt.
     * @param {Event} e - O evento de submissão do formulário.
     */
    handleAddRow: (e) => {
    e.preventDefault();
    undoManager.saveState();
    const form = e.target;
    const rowType = form.rowType.value;
    const rowName = form.rowName.value.trim();

    if (!rowName) {
        return utils.showToast("O nome da linha não pode estar vazio.", true);
    }

    undoManager.saveState(); // Salva o estado antes de adicionar

    if (rowType === 'efficiency') {
        // --- Lógica para encontrar o próximo ID numérico ---
        let newId = 1; // Começa em 1 se a lista estiver vazia
        if (state.efficiencyCategories.length > 0) {
            // Encontra o maior ID numérico existente e adiciona 1
            const maxId = Math.max(...state.efficiencyCategories.map(cat => cat.id));
            newId = maxId + 1;
        }

        const newCategory = { id: newId, name: rowName };
        state.efficiencyCategories.push(newCategory);
        dataHandlers.addScheduleCategory(newCategory, 'efficiency');
        utils.showToast("Nova linha de eficiência adicionada.");

    } else if (rowType === 'safety') {
        // --- Lógica para encontrar a próxima letra do alfabeto ---
        let newId = 'A'; // Começa em 'A' se a lista estiver vazia
        if (state.safetyCategories.length > 0) {
            // Filtra apenas os IDs que são letras únicas para encontrar a sequência
            const letterIds = state.safetyCategories
                .map(cat => cat.id)
                .filter(id => typeof id === 'string' && id.length === 1);

            if (letterIds.length > 0) {
                 // Converte as letras para os seus códigos numéricos, encontra o maior e adiciona 1
                const maxCharCode = Math.max(...letterIds.map(id => id.charCodeAt(0)));
                newId = String.fromCharCode(maxCharCode + 1); // Converte o novo código de volta para uma letra
            }
        }
        
        const newCategory = { id: newId, name: rowName };
        state.safetyCategories.push(newCategory);
        dataHandlers.addScheduleCategory(newCategory, 'safety');
        utils.showToast("Nova linha de segurança adicionada.");
    }

    state.hasUnsavedChanges = true;
    ui.toggleScheduleActions(true);
    
    renderers.renderGanttChart();
    utils.closeModal();
},

    /**
     * Adiciona um novo feriado.
     * @param {Event} e - O evento de submissão do formulário.
     */
    handleAddHoliday: (e) => {
        undoManager.saveState();
        e.preventDefault();
        const form = e.target;
        const newHoliday = {
            id: Date.now(),
            name: form.holidayName.value,
            startDate: form.startDate.value,
            endDate: form.endDate.value,
        };
        if (new Date(newHoliday.endDate) < new Date(newHoliday.startDate)) {
            utils.showToast("A data de fim não pode ser anterior à data de início.", true);
            return;
        }
        state.holidays.push(newHoliday);
        dataHandlers.addHoliday(newHoliday);
        renderers.renderHolidaysList();
        utils.showToast("Feriado adicionado com sucesso!");
        form.reset();
    },

    /**
     * Remove um feriado pelo seu ID.
     * @param {number} holidayId - O ID do feriado a ser removido.
     */
    handleRemoveHoliday: (holidayId) => {
        undoManager.saveState();
        // Remove localmente e persiste imediatamente no banco
        state.holidays = state.holidays.filter(h => h.id !== holidayId);
        renderers.renderHolidaysList();
        renderers.renderGanttChart();
        // Envia operação granular ao backend para persistir sem depender de Guardar Alterações
        vscode.postMessage({
            command: 'deleteHoliday',
            data: { id: holidayId }
        });
    },

    /** Edita um feriado existente. */
    handleEditHoliday: (holidayId) => {
        const holiday = state.holidays.find(h => h.id === holidayId);
        if (!holiday) return;
        const newName = prompt('Editar nome do feriado:', holiday.name) || holiday.name;
        const newStart = prompt('Editar data inicial (YYYY-MM-DD):', holiday.startDate) || holiday.startDate;
        const newEnd = prompt('Editar data final (YYYY-MM-DD):', holiday.endDate) || holiday.endDate;
        if (new Date(newEnd) < new Date(newStart)) {
            utils.showToast('A data de fim não pode ser anterior à data de início.', true);
            return;
        }
        holiday.name = newName;
        holiday.startDate = newStart;
        holiday.endDate = newEnd;
        renderers.renderHolidaysList();
        renderers.renderGanttChart();
        // Persiste imediatamente no banco sem exigir Guardar Alterações
        vscode.postMessage({
            command: 'updateHoliday',
            data: { id: holiday.id, name: holiday.name, startDate: holiday.startDate, endDate: holiday.endDate }
        });
    },

    /**
     * Remove um email da lista de notificações.
     * @param {string} emailToRemove - O email a ser removido.
     */
    handleRemoveEmail: (emailToRemove) => {
        let emails = state.settings.notificationEmail.split(',').filter(e => e);
        emails = emails.filter(e => e !== emailToRemove);
        state.settings.notificationEmail = emails.join(',');
        dataHandlers.saveSettings();
        renderers.populateSettingsForm();
        utils.closeModal();
        utils.showToast("E-mail removido com sucesso!");
    },
    saveEditedEmail: (oldEmail, newEmail) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            utils.showToast('E-mail inválido.', true);
            return;
        }
        let emails = state.settings.notificationEmail ? state.settings.notificationEmail.split(',').filter(e => e) : [];
        const index = emails.indexOf(oldEmail);
        if (index !== -1) {
            emails[index] = newEmail;
            state.settings.notificationEmail = emails.join(',');
            dataHandlers.saveSettings();
            renderers.populateSettingsForm();
            utils.closeModal();
            utils.showToast('E-mail atualizado com sucesso!');
        }
    },

    /** Edita um e-mail existente na lista de notificações. */
    handleEditEmail: (currentEmail) => {
        let emails = state.settings.notificationEmail ? state.settings.notificationEmail.split(',').filter(e => e) : [];
        const newEmail = prompt('Editar e-mail:', currentEmail);
        if (!newEmail) return;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            utils.showToast('E-mail inválido.', true);
            return;
        }
        const index = emails.indexOf(currentEmail);
        if (index !== -1) {
            emails[index] = newEmail;
            state.settings.notificationEmail = emails.join(',');
            dataHandlers.saveSettings();
            renderers.populateSettingsForm();
            utils.showToast('E-mail atualizado com sucesso!');
        }
    },

    /**
     * Adiciona um novo usuário do sistema.
     * @param {Event} e - O evento de submissão do formulário.
     */
    handleAddSystemUser: (e) => {
        e.preventDefault();
        const form = e.target;
        
        const username = form.username.value.trim();
        const userType = form.userType.value;
        const displayName = form.displayName.value.trim();
        
        // Validações
        if (!username || !userType || !displayName) {
            utils.showToast('Todos os campos são obrigatórios.', true);
            return;
        }
        
        if (state.systemUsers && state.systemUsers[username]) {
            utils.showToast('Usuário já existe no sistema.', true);
            return;
        }
        
        // Define permissões baseadas no tipo
        let permissions = {};
        if (userType === 'administrador') {
            permissions = {
                editHistory: true,
                addEditSupplies: true,
                accessSettings: true,
                editSchedule: true,
                dragAndDrop: true,
                editCompletedAssays: true,
                addAssays: true
            };
        } else if (userType === 'tecnico_eficiencia') {
            permissions = {
                editHistory: true,
                addEditSupplies: true,
                accessSettings: false,
                editSchedule: false,
                dragAndDrop: false,
                editCompletedAssays: false,
                addAssays: true
            };
        }
        
        // Inicializa systemUsers se não existir
        if (!state.systemUsers) {
            state.systemUsers = {};
        }
        
        // Adiciona o novo usuário
        const newUser = {
            username: username,
            type: userType,
            displayName: displayName,
            permissions: permissions
        };
        state.systemUsers[username] = newUser;
        
        // Salva no backend
        dataHandlers.addSystemUser(newUser);
        
        // Limpa o formulário
        form.reset();
        
        // Atualiza a interface
        renderers.populateSettingsForm();
        
        utils.showToast(`Usuário ${displayName} adicionado com sucesso!`);
    },

    /**
     * Remove um usuário do sistema.
     * @param {string} username - O nome de usuário a ser removido.
     */
    handleRemoveSystemUser: (username) => {
        if (username === '10088141') {
            utils.showToast('Não é possível remover o administrador principal.', true);
            return;
        }
        
        if (!state.systemUsers || !state.systemUsers[username]) {
            utils.showToast('Usuário não encontrado.', true);
            return;
        }
        
        const user = state.systemUsers[username];
        const confirmMessage = `Tem certeza que deseja remover o usuário "${user.displayName}" (@${username})?`;
        
        ui.showConfirmationModal(confirmMessage, () => {
            delete state.systemUsers[username];
            dataHandlers.deleteSystemUser(username);
            renderers.populateSettingsForm();
            utils.showToast(`Usuário ${user.displayName} removido com sucesso!`);
        });
    },
    saveEditedHoliday: (holiday) => {
        if (new Date(holiday.endDate) < new Date(holiday.startDate)) {
            utils.showToast('A data de fim não pode ser anterior à data de início.', true);
            return;
        }
        const idx = state.holidays.findIndex(h => h.id === holiday.id);
        if (idx !== -1) {
            state.holidays[idx] = { ...state.holidays[idx], ...holiday };
            renderers.renderHolidaysList();
            dataHandlers.updateHoliday(state.holidays[idx]);
            utils.closeModal();
            utils.showToast('Feriado atualizado com sucesso!');
        }
    },
    saveEditedSystemUser: (username, { displayName, type }) => {
        const user = state.systemUsers?.[username];
        if (!user) {
            utils.showToast('Usuário não encontrado.', true);
            return;
        }
        if (!['administrador', 'tecnico_eficiencia'].includes(type)) {
            utils.showToast('Tipo inválido. Use "administrador" ou "tecnico_eficiencia".', true);
            return;
        }
        user.displayName = displayName;
        user.type = type;
        dataHandlers.updateSystemUser(username, { display_name: displayName, type });
        renderers.populateSettingsForm();
        utils.closeModal();
        utils.showToast('Usuário atualizado com sucesso!');
    },

    /** Edita um usuário do sistema (nome e tipo). */
    handleEditSystemUser: (username) => {
        const user = state.systemUsers?.[username];
        if (!user) {
            utils.showToast('Usuário não encontrado.', true);
            return;
        }
        const newDisplayName = prompt('Editar nome de exibição:', user.displayName) || user.displayName;
        const newType = prompt('Editar tipo (administrador/tecnico_eficiencia):', user.type) || user.type;
        if (!['administrador', 'tecnico_eficiencia'].includes(newType)) {
            utils.showToast('Tipo inválido. Use "administrador" ou "tecnico_eficiencia".', true);
            return;
        }
        user.displayName = newDisplayName;
        user.type = newType;
        dataHandlers.updateSystemUser(user);
        renderers.populateSettingsForm();
        utils.showToast('Usuário atualizado com sucesso!');
    },

    /**
     * Salva os usuários do sistema no backend.
     */
    saveSystemUsers: () => {
        vscode.postMessage({
            command: 'saveSystemUsers',
            data: {
                systemUsers: state.systemUsers || {}
            }
        });
    },

    /**
     * Adiciona um novo insumo.
     * @param {Event} e - O evento de submissão do formulário.
     */
    handleAddReagent: (e) => {
        e.preventDefault();
        const form = e.target;
        
        // Coleta dados do formulário
        const formData = {
            reagent: form.reagent.value.trim(),
            manufacturer: form.manufacturer.value.trim(),
            lot: form.lot.value.trim(),
            quantity: form.quantity.value,
            validity: form.validity.value
        };
        
        // Valida os dados
        const errors = validator.validateInventoryItem(formData, state.inventory);
        
        if (errors.length > 0) {
            validator.displayErrors(errors, form);
            return;
        }
        
        undoManager.saveState();
        
        const newReagent = {
            id: Date.now(),
            reagent: formData.reagent,
            manufacturer: formData.manufacturer,
            lot: formData.lot,
            quantity: parseInt(formData.quantity),
            validity: formData.validity,
        };
        
        state.inventory.push(newReagent);
        
        // Log da auditoria
        auditSystem.logInventoryAction(auditSystem.actionTypes.CREATE, newReagent);
        
        dataHandlers.addInventoryItem(newReagent);
        renderers.renderAll();
        utils.closeModal();
        notificationSystem.send(
            'Insumo Adicionado com Sucesso',
            `✅ OPERAÇÃO CONCLUÍDA: Um novo insumo foi adicionado ao inventário.\n\n📊 O inventário foi atualizado e salvo automaticamente.`,
            'success'
        );
    },

    /**
     * Atualiza um insumo existente.
     * @param {Event} e - O evento de submissão do formulário.
     */
    handleUpdateReagent: (e) => {
        e.preventDefault();
        const form = e.target;
        
        const reagentIndex = state.inventory.findIndex(item => item.id === state.selectedReagentId);
        if (reagentIndex === -1) {
            utils.showToast("Erro ao salvar: Insumo não encontrado.", true);
            return;
        }
        
        // Coleta dados do formulário
        const formData = {
            reagent: form.reagent.value.trim(),
            manufacturer: form.manufacturer.value.trim(),
            lot: form.lot.value.trim(),
            quantity: form.quantity.value,
            validity: form.validity.value
        };
        
        // Valida os dados (excluindo o item atual da verificação de unicidade)
        const errors = validator.validateInventoryItem(formData, state.inventory, state.selectedReagentId);
        
        if (errors.length > 0) {
            validator.displayErrors(errors, form);
            return;
        }
        
        undoManager.saveState();
        
        const updatedItem = {
            ...state.inventory[reagentIndex],
            reagent: formData.reagent,
            manufacturer: formData.manufacturer,
            lot: formData.lot,
            quantity: parseInt(formData.quantity),
            validity: formData.validity,
        };
        state.inventory[reagentIndex] = updatedItem;
        dataHandlers.updateInventoryItem(updatedItem);
        renderers.renderAll();
        utils.closeModal();
        utils.showToast("Insumo atualizado com sucesso!");
        state.selectedReagentId = null;
    },
    /**
     *  Exclui uma linha dinâmica do cronograma.
     */
    handleDeleteRow: (categoryId, categoryName) => {
        let assaysOnRow = [];
        let categoryIndex = -1;
        let isSafety = false;

        // Procura a linha e verifica se está vazia (lógica existente)
        categoryIndex = state.safetyCategories.findIndex(c => c.id === categoryId);
        if (categoryIndex !== -1) {
            isSafety = true;
            assaysOnRow = state.safetyScheduledAssays.filter(a => a.setup === categoryId);
        } else {
            // Para categorias de eficiência, o ID pode ser string mas precisa ser comparado como número
            const numericCategoryId = parseInt(categoryId, 10);
            categoryIndex = state.efficiencyCategories.findIndex(c => c.id === numericCategoryId);
            assaysOnRow = state.scheduledAssays.filter(a => a.setup === numericCategoryId);
        }

        if (categoryIndex === -1) {
            return utils.showToast("Erro: Linha não encontrada.", true);
        }

        if (assaysOnRow.length > 0) {
            return utils.showToast(`Não é possível excluir a linha "${categoryName}", pois ela contém ${assaysOnRow.length} tarefa(s). Mova as tarefas primeiro.`, true);
        }

        const confirmationMessage = `Tem a certeza de que deseja excluir a linha "${categoryName}"?`;
        
        ui.showConfirmationModal(confirmationMessage, () => {
            // Esta função só será executada se o utilizador clicar em "Confirmar"
            undoManager.saveState();
            
            if (isSafety) {
                state.safetyCategories.splice(categoryIndex, 1);
                dataHandlers.deleteScheduleCategory(categoryId, 'safety');
            } else {
                state.efficiencyCategories.splice(categoryIndex, 1);
                // Para categorias de eficiência, usar o ID numérico
                const numericCategoryId = parseInt(categoryId, 10);
                dataHandlers.deleteScheduleCategory(numericCategoryId, 'efficiency');
            }
            renderers.renderGanttChart();
            utils.showToast(`Linha "${categoryName}" excluída com sucesso.`);
        });
    },
    

    /**
     * Exclui um insumo.
     * @param {number} reagentId - O ID do insumo a ser excluído.
     */
    handleDeleteReagent: (reagentId) => {
        undoManager.saveState();
        state.inventory = state.inventory.filter(item => item.id !== reagentId);
        utils.closeModal();
        renderers.renderAll();
        dataHandlers.deleteInventoryItem(reagentId);
        utils.showToast("Insumo excluído com sucesso!");
    },

    /**
     * Exclui um ensaio histórico.
     * @param {number} assayId - O ID do ensaio a ser excluído.
     */
    handleDeleteAssay: (assayId) => {
        undoManager.saveState();
        const historicalIndex = state.historicalAssays.findIndex(a => a.id === assayId);
        if (historicalIndex > -1) {
            // Remove do array local
            state.historicalAssays.splice(historicalIndex, 1);
            
            // Usa comando granular para deletar do banco de dados
            // O backend já cuida da reversão do estoque automaticamente
            dataHandlers.deleteHistoricalAssayGranular(assayId);
        }
        utils.closeModal();
        renderers.renderAll();
        utils.showToast("Ensaio excluído com sucesso!");
    },

    /**
     * Exclui uma tarefa do cronograma.
     * @param {number} assayId - O ID da tarefa a ser excluída.
     */
    handleDeleteGanttItem: (itemId) => {
        undoManager.saveState();
        let foundType = null; // 'safety' | 'efficiency' | 'calibration'

        // Tenta remover de ensaios de segurança
        let index = state.safetyScheduledAssays.findIndex(a => a.id === itemId);
        if (index > -1) {
            state.safetyScheduledAssays.splice(index, 1);
            foundType = 'safety';
        }

        // Tenta remover de ensaios de eficiência
        if (!foundType) {
            index = state.scheduledAssays.findIndex(a => a.id === itemId);
            if (index > -1) {
                state.scheduledAssays.splice(index, 1);
                foundType = 'efficiency';
            }
        }

        // Tenta remover de calibrações
        if (!foundType) {
            index = state.calibrations.findIndex(c => c.id === itemId);
            if (index > -1) {
                state.calibrations.splice(index, 1);
                foundType = 'calibration';
            }
        }

        if (foundType) {
            // Não persistir imediatamente; apenas marcar como alteração pendente
            state.hasUnsavedChanges = true;
            ui.toggleScheduleActions(true);
            utils.closeModal();
            renderers.renderGanttChart();
            utils.showToast("Item removido do cronograma. Clique em Guardar Alterações para aplicar ao banco.");
        } else {
            utils.showToast("Erro: Item não encontrado para exclusão.", true);
        }
    },

handleUpdateCalibration: (e) => {
    e.preventDefault();
    undoManager.saveState();
    const form = e.target;
    const calibId = parseInt(form.id.value, 10);
    const index = state.calibrations.findIndex(c => c.id === calibId);

    if (index === -1) {
        return utils.showToast("Erro: Calibração não encontrada para atualizar.", true);
    }
    
    // Atualiza os dados
    state.calibrations[index] = {
        ...state.calibrations[index],
        type: form.calibrationType.value,
        protocol: `Calibração - ${ASSAY_TYPE_MAP[form.calibrationType.value]}`,
        startDate: form.startDate.value,
        endDate: form.endDate.value,
        affectedTerminals: form.affectedTerminals ? form.affectedTerminals.value : null
    };

    state.hasUnsavedChanges = true;
    ui.toggleScheduleActions(true);
    renderers.renderGanttChart();
    utils.closeModal();
    utils.showToast("Calibração atualizada com sucesso.");
},

    /**
     * Move um ensaio do cronograma para o histórico.
     * @param {number} assayId - O ID do ensaio.
     * @param {string} newStatus - O novo status do ensaio.
     */
    handleUpdateAssayStatus: (assayId, newStatus) => {
        undoManager.saveState();
        let assayToMove = null;
        let scheduledIndex = state.scheduledAssays.findIndex(a => a.id === assayId);
        let safetyScheduledIndex = state.safetyScheduledAssays.findIndex(a => a.id === assayId);
        let table = 'scheduled_assays';

        if (scheduledIndex !== -1) {
            assayToMove = { ...state.scheduledAssays[scheduledIndex], status: newStatus };
            state.scheduledAssays.splice(scheduledIndex, 1);
            table = 'scheduled_assays';
        } else if (safetyScheduledIndex !== -1) {
            assayToMove = { ...state.safetyScheduledAssays[safetyScheduledIndex], status: newStatus };
            state.safetyScheduledAssays.splice(safetyScheduledIndex, 1);
            table = 'safety_scheduled_assays';
        }

        if (assayToMove) {
            state.historicalAssays.push(assayToMove);
            
            // Usa a função otimizada para alterar apenas o status no banco
            dataHandlers.updateAssayStatusOnly(assayId, newStatus, table);
            
            renderers.renderAll();
            utils.showToast(`Status do ensaio atualizado para '${newStatus}'!`);
        } else {
            utils.showToast("Erro: Ensaio não encontrado no cronograma.", true);
        }
    },
    /**
     * NOVA FUNÇÃO: Inicia um ensaio, alterando seu status para "Em Andamento".
     * @param {number} assayId - O ID do ensaio a ser iniciado.
     */
    handleHereAssay: (assayId) => {
        const allScheduled = [...state.scheduledAssays, ...state.safetyScheduledAssays];
        const assay = allScheduled.find(a => a.id === assayId);
        if (!assay) {
            utils.showToast("Erro: Ensaio não encontrado no cronograma.", true);
            return;
        }
        
        // Armazena os dados originais do ensaio antes de qualquer modificação
        if (!assay.originalData) {
            assay.originalData = {
                status: assay.status,
                startDate: assay.startDate,
                endDate: assay.endDate,
                cycles: assay.cycles,
                lots: assay.lots ? JSON.parse(JSON.stringify(assay.lots)) : null,
                nominalLoad: assay.nominalLoad
            };
            console.log(`[WEBVIEW] Dados originais armazenados para ensaio ${assayId}:`, assay.originalData);
        }
        
        // Armazena o status anterior para possível reversão
        if (!assay.previousStatus) {
            assay.previousStatus = assay.status;
        }
        
        assay.status = 'labelo';
        state.hasUnsavedChanges = true;
        ui.toggleScheduleActions(true);
        
        renderers.ganttInitialRenderDone = false;
        renderers.renderGanttChart();
        utils.showToast("Amostra no LABELO! Clique em 'Guardar Alterações' para confirmar.");
        utils.closeModal();
    },
    /**
     * NOVA FUNÇÃO: Inicia um ensaio, alterando seu status para "Em Andamento".
     * @param {number} assayId - O ID do ensaio a ser iniciado.
     */
    handleStartAssay: (assayId) => {
        const allScheduled = [...state.scheduledAssays, ...state.safetyScheduledAssays];
        const assay = allScheduled.find(a => a.id === assayId);
        if (!assay) {
            utils.showToast("Erro: Ensaio não encontrado no cronograma.", true);
            return;
        }
        
        // Armazena os dados originais do ensaio antes de qualquer modificação
        if (!assay.originalData) {
            assay.originalData = {
                status: assay.status,
                startDate: assay.startDate,
                endDate: assay.endDate,
                cycles: assay.cycles,
                lots: assay.lots ? JSON.parse(JSON.stringify(assay.lots)) : null,
                nominalLoad: assay.nominalLoad
            };
            console.log(`[WEBVIEW] Dados originais armazenados para ensaio ${assayId}:`, assay.originalData);
        }
        
        // Armazena o status anterior para possível reversão
        if (!assay.previousStatus) {
            assay.previousStatus = assay.status;
        }
        
        assay.status = 'andamento';
        state.hasUnsavedChanges = true;
        ui.toggleScheduleActions(true);
        
        renderers.ganttInitialRenderDone = false;
        renderers.renderGanttChart();
        utils.showToast("Ensaio iniciado! Clique em 'Guardar Alterações' para confirmar.");
        utils.closeModal();
    },

    /**
     * NOVA FUNÇÃO: Move um ensaio para o histórico após a conclusão,
     * deduzindo o estoque e atualizando as datas e lotes.
     * @param {Event} e - Evento de submissão do formulário.
     * @param {number} assayId - ID do ensaio.
     * @param {string} newStatus - Novo status ('concluido' ou 'incompleto').
     */
    handleFinishAssay: (e, assayId, newStatus) => {
    undoManager.saveState();
    e.preventDefault();
    const form = e.target;
    
    let assayToUpdate = null;
    let scheduledIndex = state.scheduledAssays.findIndex(a => a.id === assayId);
    let isSafetyAssay = false;

    if (scheduledIndex !== -1) {
        assayToUpdate = state.scheduledAssays[scheduledIndex];
    } else {
        scheduledIndex = state.safetyScheduledAssays.findIndex(a => a.id === assayId);
        if (scheduledIndex !== -1) {
            assayToUpdate = state.safetyScheduledAssays[scheduledIndex];
            isSafetyAssay = true;
        }
    }

    if (!assayToUpdate) {
        return utils.showToast("Erro ao concluir: Ensaio não encontrado no cronograma.", true);
    }

    // Armazena os dados originais do ensaio antes de qualquer modificação
    if (!assayToUpdate.originalData) {
        assayToUpdate.originalData = {
            status: assayToUpdate.status,
            startDate: assayToUpdate.startDate,
            endDate: assayToUpdate.endDate,
            cycles: assayToUpdate.cycles,
            lots: assayToUpdate.lots ? JSON.parse(JSON.stringify(assayToUpdate.lots)) : null,
            nominalLoad: assayToUpdate.nominalLoad
        };
        console.log(`[WEBVIEW] Dados originais armazenados para ensaio ${assayId}:`, assayToUpdate.originalData);
    }

    const newStartDate = form.newStartDate.value;
    const newEndDate = form.newEndDate.value;
    
    if (!newStartDate || !newEndDate || new Date(newEndDate) < new Date(newStartDate)) {
        return utils.showToast("Por favor, forneça um período de datas válido.", true);
    }

    // Se NÃO for um ensaio de segurança, executa a lógica de lotes e consumo
    if (!isSafetyAssay) {
        const newLots = {};
        let totalCyclesSum = 0;
        let totalLotEntries = 0;

        const lotContainers = form.querySelectorAll('.lote-container');
        lotContainers.forEach(container => {
            const reagentType = container.dataset.reagentType;
            newLots[reagentType] = [];
            container.querySelectorAll('.lote-entry').forEach(entry => {
                const lot = entry.querySelector('select[name="lote"]').value;
                const cycles = parseInt(entry.querySelector('input[name="cycles"]').value, 10);
                if (lot && cycles > 0) {
                    newLots[reagentType].push({ lot, cycles });
                    totalCyclesSum += cycles;
                    totalLotEntries++;
                }
            });
        });

        const averageCycles = totalCyclesSum > 0 ? Math.round(totalCyclesSum / 4) : 0;
        assayToUpdate.cycles = averageCycles;
        assayToUpdate.lots = newLots;

        // Valida se há estoque suficiente, mas NÃO deduz ainda
        if (!validateStock('poBase', newLots.poBase, assayToUpdate.nominalLoad)) return;
        if (!validateStock('perborato', newLots.perborato, assayToUpdate.nominalLoad)) return;
        if (!validateStock('taed', newLots.taed, assayToUpdate.nominalLoad)) return;
        if (!validateStock('tiras', newLots.tiras, assayToUpdate.nominalLoad)) return;
        
        // Armazena os dados de consumo para desconto posterior
        assayToUpdate.pendingStockDeduction = {
            poBase: newLots.poBase,
            perborato: newLots.perborato,
            taed: newLots.taed,
            tiras: newLots.tiras,
            nominalLoad: assayToUpdate.nominalLoad
        };

        // Calcula o consumo total baseado nos lotes utilizados
        const consumption = {
            poBase: newLots.poBase.reduce((sum, l) => sum + (16 * assayToUpdate.nominalLoad + 54) * l.cycles * 0.77, 0),
            perborato: newLots.perborato.reduce((sum, l) => sum + (16 * assayToUpdate.nominalLoad + 54) * l.cycles * 0.20, 0),
            taed: newLots.taed.reduce((sum, l) => sum + (16 * assayToUpdate.nominalLoad + 54) * l.cycles * 0.03, 0),
            tiras: newLots.tiras.reduce((sum, l) => sum + calculations.calculateTiras(assayToUpdate.nominalLoad) * l.cycles, 0)
        };
        
        // Calcula o consumo total de sabão (soma de todos os reagentes)
        assayToUpdate.totalConsumption = consumption.poBase + consumption.perborato + consumption.taed + consumption.tiras;
        assayToUpdate.consumption = consumption;
        assayToUpdate.pendingStockDeduction = {
            poBase: newLots.poBase,
            perborato: newLots.perborato,
            taed: newLots.taed,
            tiras: newLots.tiras,
            nominalLoad: assayToUpdate.nominalLoad
        };
    }
    
    // Atualiza as informações comuns a ambos os tipos de ensaio
    assayToUpdate.startDate = newStartDate;
    assayToUpdate.endDate = newEndDate;
    assayToUpdate.status = newStatus;
    assayToUpdate.report = (newStatus === 'incompleto') ? 'Pendente' : 'Pendente'; // Define como pendente em ambos os casos

    // Para ensaios de eficiência, armazena os dados para envio posterior ao histórico
    if (!isSafetyAssay && (newStatus === 'concluido' || newStatus === 'incompleto')) {
        // Marca que este ensaio precisa ser enviado ao histórico quando salvar
        assayToUpdate.pendingHistoryAdd = true;
        
        // Armazena uma cópia dos dados para o histórico
        if (!state.pendingHistoricalAssays) {
            state.pendingHistoricalAssays = [];
        }
        
        const historicalAssay = { ...assayToUpdate };
        delete historicalAssay.pendingHistoryAdd; // Remove a flag da cópia histórica
        delete historicalAssay.previousStatus; // Remove o status anterior da cópia histórica
        
        // Remove qualquer entrada anterior deste ensaio na lista pendente
        state.pendingHistoricalAssays = state.pendingHistoricalAssays.filter(h => h.id !== assayId);
        state.pendingHistoricalAssays.push(historicalAssay);
    }

    // NÃO remove do cronograma - apenas atualiza o status
    // O ensaio permanece visível no cronograma com o novo status

    state.hasUnsavedChanges = true;
    ui.toggleScheduleActions(true);
    utils.closeModal();
    renderers.renderAll();
    utils.showToast(`Status do ensaio atualizado para '${ASSAY_STATUS_MAP[newStatus] || newStatus}'. Clique em 'Guardar Alterações' para confirmar.`);
},

    /**
     * NOVA FUNÇÃO: Lida com o salvamento de um relatório e altera o status.
     * @param {Event} e - Evento de submissão do formulário.
     * @param {number} assayId - ID do ensaio.
     */
    handleSaveReportModal: (e, assayId) => {
        undoManager.saveState();
        e.preventDefault();
        const form = e.target;
        const reportNumber = form.reportNumber.value;
        
        // Procura o ensaio no cronograma (scheduledAssays ou safetyScheduledAssays)
        let scheduledAssay = state.scheduledAssays.find(a => a.id === assayId);
        if (!scheduledAssay) {
            scheduledAssay = state.safetyScheduledAssays.find(a => a.id === assayId);
        }
        
        // Procura o ensaio no histórico (historicalAssays)
        const historicalAssay = state.historicalAssays.find(a => a.id === assayId);

        if (!reportNumber) {
            utils.showToast("O número do relatório é obrigatório.", true);
            return;
        }

        if (scheduledAssay) {
            // Atualiza o ensaio no cronograma, se existir
            scheduledAssay.report = reportNumber;
            scheduledAssay.status = 'relatorio';
            state.hasUnsavedChanges = true;
            ui.toggleScheduleActions(true);
        }
        
        if (historicalAssay) {
            // Atualiza o ensaio no histórico, se existir
            historicalAssay.report = reportNumber;
            historicalAssay.status = 'relatorio';
            // Não salvar imediatamente; alinhar com o comportamento de "Guardar Alterações"
            state.hasUnsavedChanges = true;
            ui.toggleScheduleActions(true);
        } else if (!scheduledAssay) {
            // Se o ensaio não foi encontrado em nenhum dos locais, mostra um erro.
            utils.showToast("Erro: Ensaio não encontrado para adicionar relatório.", true);
            return;
        }

        renderers.renderAll();
        utils.closeModal();
        utils.showToast("Relatório adicionado com sucesso!");
    },


    /**
     * Adiciona um novo ensaio histórico e atualiza o estoque.
     * @param {Event} e - O evento de submissão do formulário.
     */
    handleAddAssay: (e) => {
        undoManager.saveState();
        e.preventDefault();
        const form = e.target;
        
        // Função auxiliar para obter valores do formulário com segurança
        const getFormValue = (elementName, defaultValue = '') => {
            const element = form[elementName] || form.querySelector(`[name="${elementName}"]`);
            return element ? element.value : defaultValue;
        };

        const getFormFloatValue = (elementName, defaultValue = 0) => {
            const element = form[elementName] || form.querySelector(`[name="${elementName}"]`);
            return element ? parseFloat(element.value) || defaultValue : defaultValue;
        };

        const getFormIntValue = (elementName, defaultValue = 0) => {
            const element = form[elementName] || form.querySelector(`[name="${elementName}"]`);
            return element ? parseInt(element.value) || defaultValue : defaultValue;
        };

        // Obter valores do formulário
        const nominalLoad = getFormFloatValue('nominalLoad');
        
        // Validação básica
        if (!nominalLoad || nominalLoad <= 0) {
            utils.showToast('Carga nominal deve ser maior que zero.', true);
            return;
        }
        
        // Coleta os dados dos lotes dinâmicos dos containers
        const lots = {};
        const lotContainers = form.querySelectorAll('.lote-container');
        let totalCyclesSum = 0;
        let totalLotEntries = 0;

        lotContainers.forEach(container => {
            const reagentType = container.dataset.reagentType;
            lots[reagentType] = [];
            container.querySelectorAll('.lote-entry').forEach(entry => {
                const lot = entry.querySelector('select[name="lote"]').value;
                const cycles = parseInt(entry.querySelector('input[name="cycles"]').value, 10);
                if (lot && cycles > 0) {
                    lots[reagentType].push({ lot, cycles });
                    totalCyclesSum += cycles;
                    totalLotEntries++;
                }
            });
        });

        // Calcular a média dos ciclos informados nos containers
        const averageCycles = totalCyclesSum > 0 ? Math.round(totalCyclesSum / 4) : 0;
        
        // Validação dos ciclos
        if (averageCycles <= 0) {
            utils.showToast('Pelo menos um lote com ciclos deve ser informado.', true);
            return;
        }

        // Verificar e deduzir estoque usando a função global checkAndDeductStock
        if (!checkAndDeductStock('poBase', lots.poBase || [], nominalLoad)) return;
        if (!checkAndDeductStock('perborato', lots.perborato || [], nominalLoad)) return;
        if (!checkAndDeductStock('taed', lots.taed || [], nominalLoad)) return;
        if (!checkAndDeductStock('tiras', lots.tiras || [], nominalLoad)) return;

        // Calcular o consumo total baseado nos lotes utilizados
        const consumption = {
            poBase: (lots.poBase || []).reduce((sum, l) => sum + (16 * nominalLoad + 54) * l.cycles * 0.77, 0),
            perborato: (lots.perborato || []).reduce((sum, l) => sum + (16 * nominalLoad + 54) * l.cycles * 0.20, 0),
            taed: (lots.taed || []).reduce((sum, l) => sum + (16 * nominalLoad + 54) * l.cycles * 0.03, 0),
            tiras: (lots.tiras || []).reduce((sum, l) => sum + calculations.calculateTiras(nominalLoad) * l.cycles, 0)
        };
        
        // Calcular o consumo total de sabão (soma de todos os reagentes)
        const totalConsumption = consumption.poBase + consumption.perborato + consumption.taed + consumption.tiras;
        
        // Criar objeto do novo ensaio
        const newAssay = {
            id: Date.now(),
            protocol: getFormValue('protocol'),
            orcamento: getFormValue('orcamento'),
            assayManufacturer: getFormValue('assayManufacturer'),
            model: getFormValue('model'),
            nominalLoad: nominalLoad,
            cycles: averageCycles,
            type: getFormValue('type'),
            startDate: getFormValue('startDate'),
            endDate: getFormValue('endDate'),
            observacoes: getFormValue('reason') || getFormValue('observacoes') || '',
            report: null,
            lots: lots,
            consumption: consumption,
            totalConsumption: totalConsumption,
            status: 'Concluido',
            setup: getFormIntValue('setup', 0),
            tensao: getFormValue('tensao'),
            plannedSuppliers: {
                poBase: getFormValue('mainSupplier'),
                taed: getFormValue('mainSupplier')
            }
        };

        // Adicionar ao histórico e salvar
        state.historicalAssays.push(newAssay);
        dataHandlers.saveData();
        renderers.renderAll();
        utils.closeModal();
        
        // Notificação de sucesso
        notificationSystem.send(
            'Ensaio Registrado com Sucesso',
            `✅ OPERAÇÃO CONCLUÍDA: O ensaio foi registrado no histórico e o estoque foi atualizado automaticamente.`,
            'success'
        );
    },

    /**
     * Salva o código de relatório para um ensaio.
     * @param {Event} e - O evento de submissão do formulário.
     */
    handleSaveReport: (e) => {
        undoManager.saveState();
        e.preventDefault();
        const form = e.target;
        const reportCode = form.report.value;
        const assayIndex = state.historicalAssays.findIndex(a => a.id === state.selectedAssayId);
        if (assayIndex !== -1) {
            state.historicalAssays[assayIndex].report = reportCode;
            dataHandlers.saveData();
            renderers.renderAll();
            utils.closeModal();
            utils.showToast("Relatório guardado com sucesso!");
        } else {
            utils.showToast("Erro: Ensaio não encontrado.", true);
        }
        state.selectedAssayId = null;
    },
    handleAddSafetyAssay: (e) => {
    undoManager.saveState();
    e.preventDefault();
    const form = e.target;
    
    // Validação básica para garantir que campos essenciais foram preenchidos
    const requiredFields = ['protocol', 'startDate', 'endDate', 'setup', 'status', 'type'];
    for (const fieldName of requiredFields) {
        if (!form[fieldName] || !form[fieldName].value) {
            utils.showToast(`Erro: O campo '${fieldName}' é obrigatório.`, true);
            return;
        }
    }

    const startDate = form.startDate.value;
    const endDate = form.endDate.value;
    const reportDateInput = form.querySelector('[name="reportDate"]');

    if (new Date(endDate) < new Date(startDate)) {
        utils.showToast('A data de fim não pode ser anterior à data de início.', true);
        return;
    }

    const newSafetyAssay = {
        id: Date.now(),
        protocol: form.protocol.value,
        orcamento: form.orcamento?.value || 'N/A',
        assayManufacturer: form.assayManufacturer?.value || 'N/A',
        model: form.model?.value || 'N/A',
        nominalLoad: parseFloat(form.nominalLoad?.value) || 0,
        tensao: form.tensao.value,
        startDate: startDate,
        endDate: endDate,
        reportDate: reportDateInput?.value || '',
        setup: form.setup.value, // A, B, ou C para segurança
        status: form.status.value,
        type: 'seguranca-eletrica', // Tipo fixo para este modal
        observacoes: utils.mergeObservacoesWithLinkTags(originalArray[assayIndex].observacoes, form.observacoes?.value || ''),
        cycles: parseInt(form.cycles?.value) || 0,
    };

    // Adiciona o novo ensaio à array específica de segurança
    state.safetyScheduledAssays.push(newSafetyAssay);

    // Marca que há alterações não salvas e exibe os botões de ação
    state.hasUnsavedChanges = true;
    ui.toggleScheduleActions(true);

    // Renderiza o gráfico novamente para exibir a nova tarefa
    renderers.renderGanttChart();
    utils.closeModal();
    utils.showToast("Ensaio de segurança adicionado. Guarde as alterações para confirmar.");

    setTimeout(() => {
    renderers.renderGanttChart();
}, 50);
},

    /**
     * Adiciona um novo ensaio ao cronograma.
     * @param {Event} e - O evento de submissão do formulário.
     */
    handleAddGanttAssay: (e) => {
        undoManager.saveState();
        e.preventDefault();
        const form = e.target;
        const startDateInput = form.querySelector('[name="startDate"]');
        const orcamentoInput = form.querySelector('[name="orcamento"]');
        const mainSupplierInput = form.querySelector('[name="mainSupplier"]');
        const assayManufacturerInput = form.querySelector('[name="assayManufacturer"]');
        const endDateInput = form.querySelector('[name="endDate"]');
        const modelInput = form.querySelector('[name="model"]');
        const protocolInput = form.querySelector('[name="protocol"]');
        const nominalLoadInput = form.querySelector('[name="nominalLoad"]');
        const tensaoInput = form.querySelector('[name="tensao"]');
        const setupInput = form.querySelector('[name="setup"]');
        const statusInput = form.querySelector('[name="status"]');
        const typeInput = form.querySelector('[name="type"]');
        const observacoesInput = form.querySelector('[name="observacoes"]');
        const cyclesInput = form.querySelector('[name="cycles"]');
        const reportDateInput = form.querySelector('[name="reportDate"]');
        if (!protocolInput.value || !startDateInput.value || !endDateInput.value || !setupInput.value || !statusInput.value || !typeInput.value) {
            utils.showToast('Erro: Por favor, preencha todos os campos obrigatórios.', true);
            return;
        }
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        if (new Date(endDate) < new Date(startDate)) {
            utils.showToast('A data de fim não pode ser anterior à data de início.', true);
            return;
        }
        const newAssay = {
            id: Date.now(),
            protocol: protocolInput.value,
            orcamento: orcamentoInput?.value || 'N/A',
            assayManufacturer: assayManufacturerInput?.value || 'N/A',
            model: modelInput?.value || 'N/A',
            nominalLoad: parseFloat(nominalLoadInput?.value) || 0,
            tensao: tensaoInput.value,
            startDate: startDate,
            endDate: endDate,
            reportDate: reportDateInput?.value || '',
            setup: parseInt(setupInput.value, 10),
            status: statusInput.value,
            type: typeInput.value,
            observacoes: observacoesInput?.value || '',
            cycles: parseInt(cyclesInput?.value) || 0,
            plannedSuppliers: {
                poBase: mainSupplierInput ? mainSupplierInput.value : '',
                taed: mainSupplierInput ? mainSupplierInput.value : ''
            }
        };
        state.scheduledAssays.push(newAssay);
        const linkSafetyChk = form.querySelector('[name="linkSafety"]');
        if (linkSafetyChk && linkSafetyChk.checked) {
            const safetyStart = form.querySelector('[name="safetyStartDate"]')?.value || startDate;
            const safetyEnd = form.querySelector('[name="safetyEndDate"]')?.value || endDate;
            const safetySetup = form.querySelector('[name="safetySetup"]')?.value || '';
            const safetyAssay = {
                id: Date.now() + 1,
                protocol: newAssay.protocol,
                orcamento: newAssay.orcamento,
                assayManufacturer: newAssay.assayManufacturer,
                model: newAssay.model,
                nominalLoad: newAssay.nominalLoad,
                tensao: newAssay.tensao,
                startDate: safetyStart,
                endDate: safetyEnd,
                reportDate: '',
                setup: safetySetup || 'A',
                status: 'aguardando',
                type: 'seguranca-eletrica',
                observacoes: '',
                cycles: 0,
                plannedSuppliers: null,
                subRowIndex: 0
            };
            state.safetyScheduledAssays.push(safetyAssay);
            newAssay.observacoes = ((newAssay.observacoes || '') + ` [link_safety:${safetyAssay.id}]`).trim();
            safetyAssay.observacoes = ((safetyAssay.observacoes || '') + ` [link_efficiency:${newAssay.id}]`).trim();
            state.assayLinks.push({ from: newAssay.id, to: safetyAssay.id });
        }
        state.hasUnsavedChanges = true;
        ui.toggleScheduleActions(true);
        renderers.renderGanttChart();
        utils.closeModal();
        utils.showToast("Tarefa adicionada. Guarde as alterações para confirmar.");

        setTimeout(() => {
    renderers.renderGanttChart();
}, 50);
    },

    /**
     * Adiciona um novo evento de calibração ao cronograma.
     * @param {Event} e - O evento de submissão do formulário.
     */
    handleAddCalibration: (e) => {
        undoManager.saveState();
        e.preventDefault();
        const form = e.target;
        const startDate = form.startDate.value;
        const endDate = form.endDate.value;
        const calibrationType = form.calibrationType.value;
        const affectedTerminals = form.affectedTerminals.value;

        if (!startDate || !endDate || !calibrationType) {
            utils.showToast('Por favor, preencha todos os campos obrigatórios.', true);
            return;
        }

        if (new Date(endDate) < new Date(startDate)) {
            utils.showToast('A data de fim não pode ser anterior à data de início.', true);
            return;
        }

        const newCalibrationEvent = {
            id: Date.now(),
            protocol: `Calibração - ${ASSAY_TYPE_MAP[calibrationType]}`,
            startDate: startDate,
            endDate: endDate,
            type: calibrationType,
            status: 'Calibração',
            affectedTerminals: affectedTerminals
        };

        state.calibrations.push(newCalibrationEvent);
        state.hasUnsavedChanges = true;
        ui.toggleScheduleActions(true);
        renderers.ganttInitialRenderDone = false;
        renderers.renderGanttChart();
        utils.closeModal();
        utils.showToast("Calibração adicionada. Guarde as alterações para confirmar.");
    },

    /**
     * Adiciona um novo período de férias ao cronograma.
     * @param {Event} e - O evento de submissão do formulário.
     */
    handleAddVacation: (e) => {
        undoManager.saveState();
        e.preventDefault();
        const form = e.target;
        const employeeName = form.employeeName.value;
        const startDate = form.startDate.value;
        const endDate = form.endDate.value;
        if (!startDate || !endDate) {
            utils.showToast('Por favor, preencha as datas de início e fim.', true);
            return;
        }
        if (new Date(endDate) < new Date(startDate)) {
            utils.showToast('A data de fim não pode ser anterior à data de início.', true);
            return;
        }
        const newVacationEvent = {
            id: Date.now(),
            protocol: `Férias - ${employeeName}`,
            startDate: startDate,
            endDate: endDate,
            type: 'férias',
            status: 'férias',
            model: null,
            assayManufacturer: null,
            tensao: null,
            nominalLoad: null,
            setup: null,
        };
        state.scheduledAssays.push(newVacationEvent);
        state.hasUnsavedChanges = true;
        ui.toggleScheduleActions(true);
        renderers.ganttInitialRenderDone = false;
        renderers.renderGanttChart();
        utils.closeModal();
        utils.showToast("Férias adicionadas. Guarde as alterações para confirmar.");
    },

    /**
     * Atualiza um período de férias no cronograma.
     * @param {Event} e - O evento de submissão do formulário.
     */
    handleUpdateVacation: (e) => {
        undoManager.saveState();
        e.preventDefault();
        const form = e.target;
        const assayIndex = state.scheduledAssays.findIndex(a => a.id === state.selectedAssayId);
        if (assayIndex === -1) {
            utils.showToast("Erro ao salvar: Período de férias não encontrado.", true);
            return;
        }
        state.scheduledAssays[assayIndex] = {
            ...state.scheduledAssays[assayIndex],
            protocol: `Férias - ${form.employeeName.value}`,
            startDate: form.startDate.value,
            endDate: form.endDate.value,
        };
        state.hasUnsavedChanges = true;
        ui.toggleScheduleActions(true);
        renderers.ganttInitialRenderDone = false;
        renderers.renderGanttChart();
        utils.closeModal();
        utils.showToast("Período de férias atualizado. Guarde as alterações para confirmar.");
        state.selectedAssayId = null;
    },

    /**
     * Atualiza um ensaio histórico.
     * @param {Event} e - O evento de submissão do formulário.
     */
    handleUpdateAssay: (e) => {
        undoManager.saveState();
        e.preventDefault();
        const form = e.target;
        const mainSupplierInput = form.querySelector('[name="mainSupplier"]');
        const assayIndex = state.historicalAssays.findIndex(a => a.id === state.selectedAssayId);
        if (assayIndex === -1) {
            utils.showToast("Erro ao salvar: Ensaio não encontrado.", true);
            return;
        }
        
        // Verificação de segurança para mainSupplierInput
        if (!mainSupplierInput) {
            console.warn('Campo mainSupplier não encontrado no formulário');
        }
        
        // Obter dados originais do ensaio para reverter o desconto
        const canonicalStringify = (obj) => {
        const sortedObj = {};
        if (!obj) return '{}';
        // Garante que a ordem das chaves de reagente seja sempre a mesma
        Object.keys(obj).sort().forEach(key => {
            if (Array.isArray(obj[key])) {
                // Ordena também o array de lotes para consistência
                sortedObj[key] = [...obj[key]].sort((a, b) => a.lot.localeCompare(b.lot) || a.cycles - b.cycles);
            } else {
                sortedObj[key] = obj[key];
            }
        });
        return JSON.stringify(sortedObj);
    };

    // 1. Obter os dados originais do ensaio
    const originalAssay = state.historicalAssays[assayIndex];
    const originalLots = originalAssay.lots || {};
    const originalNominalLoad = originalAssay.nominalLoad;

    // 2. NORMALIZE o objeto de lotes original para garantir que todas as chaves de reagentes existam
    const allReagentKeys = ['poBase', 'perborato', 'taed', 'tiras'];
    const normalizedOriginalLots = {};
    allReagentKeys.forEach(key => {
        normalizedOriginalLots[key] = originalLots[key] || [];
    });

    // 3. Obter os novos dados do formulário
    const newNominalLoad = parseFloat(form.nominalLoad.value);
    const newLots = {}; // Este objeto já é construído de forma "normalizada" abaixo
    let totalCycles = 0;
    const lotContainers = form.querySelectorAll('.lote-container');
    lotContainers.forEach(container => {
        const reagentType = container.dataset.reagentType;
        newLots[reagentType] = [];
        container.querySelectorAll('.lote-entry').forEach(entry => {
            const lot = entry.querySelector('select[name="lote"]').value;
            const cycles = parseInt(entry.querySelector('input[name="cycles"]').value);
            if (lot && cycles > 0) {
                newLots[reagentType].push({ lot, cycles });
                totalCycles += cycles;
            }
        });
    });

    const averageCycles = totalCycles > 0 ? Math.round(totalCycles / 4) : 0;

    // 4. Comparar lotes/ciclos E carga nominal
    const lotsChanged = canonicalStringify(normalizedOriginalLots) !== canonicalStringify(newLots);
    const nominalLoadChanged = originalNominalLoad !== newNominalLoad; // Nova verificação

    if (lotsChanged || nominalLoadChanged) {
        console.log(`Detectada alteração. Lotes mudaram: ${lotsChanged}, Carga Nominal mudou: ${nominalLoadChanged}. Recalculando estoque...`);

        // 4a. Validar se o novo consumo é possível ANTES de qualquer alteração no estoque
        //     A função validateStock já usa a carga nominal correta (newNominalLoad)
        if (!validateStock('poBase', newLots.poBase || [], newNominalLoad)) return;
        if (!validateStock('perborato', newLots.perborato || [], newNominalLoad)) return;
        if (!validateStock('taed', newLots.taed || [], newNominalLoad)) return;
        if (!validateStock('tiras', newLots.tiras || [], newNominalLoad)) return;

        // 4b. Reverter o desconto antigo usando os dados ORIGINAIS (lotes e carga nominal)
        console.log(`Revertendo consumo antigo com carga ${originalNominalLoad}`);
        if (originalLots.poBase) revertStockDeduction('poBase', originalLots.poBase, originalNominalLoad);
        if (originalLots.perborato) revertStockDeduction('perborato', originalLots.perborato, originalNominalLoad);
        if (originalLots.taed) revertStockDeduction('taed', originalLots.taed, originalNominalLoad);
        if (originalLots.tiras) revertStockDeduction('tiras', originalLots.tiras, originalNominalLoad);

        // 4c. Aplicar o novo desconto usando os NOVOS dados (lotes e carga nominal)
        console.log(`Aplicando novo consumo com carga ${newNominalLoad}`);
        // Usamos || [] para garantir que passamos um array vazio se o lote não foi selecionado
        checkAndDeductStock('poBase', newLots.poBase || [], newNominalLoad);
        checkAndDeductStock('perborato', newLots.perborato || [], newNominalLoad);
        checkAndDeductStock('taed', newLots.taed || [], newNominalLoad);
        checkAndDeductStock('tiras', newLots.tiras || [], newNominalLoad);

    } else {
        console.log("Nenhuma alteração nos lotes/ciclos ou carga nominal. Estoque não será modificado.");
    }
        
        state.historicalAssays[assayIndex] = {
            ...state.historicalAssays[assayIndex],
            protocol: form.protocol.value,
            orcamento: form.orcamento.value,
            assayManufacturer: form.assayManufacturer.value,
            model: form.model.value,
            nominalLoad: parseFloat(form.nominalLoad.value),
            cycles: averageCycles,
            type: form.type.value,
            startDate: form.startDate.value,
            endDate: form.endDate.value,
            lots: newLots,
            setup: parseInt(form.setup.value) || 0,
            tensao: form.tensao.value,
            plannedSuppliers: {
                poBase: mainSupplierInput ? mainSupplierInput.value : '',
                taed: mainSupplierInput ? mainSupplierInput.value : ''
            }
        };
        try {
            dataHandlers.saveData();
            renderers.renderAll();
            utils.closeModal();
            utils.showToast("Ensaio histórico atualizado com sucesso!");
            state.selectedAssayId = null;
        } catch (error) {
            console.error('Erro ao salvar ensaio:', error);
            utils.showToast('Erro ao salvar ensaio. Verifique os dados e tente novamente.', true);
        }
    },

    handleUpdateSafetyAssay: (e) => {
    undoManager.saveState();
        e.preventDefault();
    const form = e.target;
    const assayIndex = state.safetyScheduledAssays.findIndex(a => a.id === state.selectedAssayId);

    if (assayIndex === -1) {
        utils.showToast("Erro ao salvar: Ensaio de segurança não encontrado.", true);
        return;
    }

    const startDate = form.startDate.value;
    const endDate = form.endDate.value;
    if (new Date(endDate) < new Date(startDate)) {
        utils.showToast('A data de fim não pode ser anterior à data de início.', true);
        return;
    }

    // Atualiza o objeto do ensaio com os novos valores do formulário
    const assayToUpdate = state.safetyScheduledAssays[assayIndex];
    assayToUpdate.protocol = form.protocol.value;
    assayToUpdate.orcamento = form.orcamento?.value || 'N/A';
    assayToUpdate.assayManufacturer = form.assayManufacturer?.value || 'N/A';
    assayToUpdate.model = form.model?.value || 'N/A';
    assayToUpdate.nominalLoad = parseFloat(form.nominalLoad?.value) || 0;
    assayToUpdate.tensao = form.tensao?.value || 'N/A';
    assayToUpdate.startDate = startDate;
    assayToUpdate.endDate = endDate;
    assayToUpdate.reportDate = form.reportDate?.value || '';
    assayToUpdate.setup = form.setup.value;
    assayToUpdate.status = form.status.value;
    assayToUpdate.observacoes = utils.mergeObservacoesWithLinkTags(assayToUpdate.observacoes, form.observacoes?.value || '');

    state.hasUnsavedChanges = true;
    ui.toggleScheduleActions(true);
    renderers.ganttInitialRenderDone = false;
    renderers.renderGanttChart();
    utils.closeModal();
    utils.showToast("Ensaio de segurança atualizado. Guarde as alterações para confirmar.");
    state.selectedAssayId = null;
},

    /**
     * Atualiza uma tarefa no cronograma.
     * @param {Event} e - O evento de submissão do formulário.
     */
    handleUpdateGanttAssay: (e) => {
    undoManager.saveState();
    e.preventDefault();
    const form = e.target;

    const assayId = state.selectedAssayId;
    let isSafetyAssay = state.safetyScheduledAssays.some(a => a.id === assayId);
    let originalArray = isSafetyAssay ? state.safetyScheduledAssays : state.scheduledAssays;
    const assayIndex = originalArray.findIndex(a => a.id === assayId);

    if (assayIndex === -1) {
        return utils.showToast("Erro ao salvar: Tarefa não encontrada.", true);
    }

    const newSetupValue = form.setup.value;
    const newSetup = /^[0-9]+$/.test(newSetupValue) ? parseInt(newSetupValue, 10) : newSetupValue;
    const mainSupplierInput = form.querySelector('[name="mainSupplier"]');
    const newIsSafety = state.safetyCategories.some(cat => cat.id === newSetup);
    const updatedData = {
        protocol: form.protocol.value,
        orcamento: form.orcamento?.value || 'N/A',
        assayManufacturer: form.assayManufacturer?.value || 'N/A',
        model: form.model?.value || 'N/A',
        nominalLoad: parseFloat(form.nominalLoad?.value) || 0,
        tensao: form.tensao?.value || 'N/A',
        startDate: form.startDate.value,
        endDate: form.endDate.value,
        setup: newSetup, // Usa o valor já convertido
        status: form.status.value,
        type: newIsSafety ? 'seguranca-eletrica' : form.type.value,
        reportDate: form.reportDate.value,
        observacoes: form.observacoes?.value || '',
        cycles: parseInt(form.cycles?.value) || 0,
        plannedSuppliers: {
            poBase: mainSupplierInput ? mainSupplierInput.value : '',
            taed: mainSupplierInput ? mainSupplierInput.value : ''
        }
    };

    if (isSafetyAssay !== newIsSafety) {
        const assayToMove = { ...originalArray[assayIndex], ...updatedData };
        originalArray.splice(assayIndex, 1);
        
        if (newIsSafety) {
            state.safetyScheduledAssays.push(assayToMove);
        } else {
            state.scheduledAssays.push(assayToMove);
        }
    } else {
        originalArray[assayIndex] = { ...originalArray[assayIndex], ...updatedData };
    }

    state.hasUnsavedChanges = true;
    ui.toggleScheduleActions(true);
    renderers.ganttInitialRenderDone = false;
    renderers.renderGanttChart();
    utils.closeModal();
    utils.showToast("Tarefa atualizada. Guarde as alterações para confirmar.");
    state.selectedAssayId = null;
},

    /**
     * Manipula a atualização de ensaios de secadoras.
     * @param {Event} e - O evento de submit do formulário.
     */
    handleUpdateDryerAssay: (e) => {
        undoManager.saveState();
        e.preventDefault();
        const form = e.target;

        const assayId = state.selectedAssayId;
        const assayIndex = state.scheduledAssays.findIndex(a => a.id === assayId);

        if (assayIndex === -1) {
            return utils.showToast("Erro ao salvar: Ensaio de secadora não encontrado.", true);
        }

        const newSetupValue = form.setup.value;
        const newSetup = /^[0-9]+$/.test(newSetupValue) ? parseInt(newSetupValue, 10) : newSetupValue;
        
        const updatedData = {
            protocol: form.protocol.value,
            orcamento: form.orcamento?.value || 'N/A',
            humidity: form.humidity?.value || 'N/A',
            assayManufacturer: form.assayManufacturer?.value || 'N/A',
            model: form.model?.value || 'N/A',
            nominalLoad: parseFloat(form.nominalLoad?.value) || 0,
            tensao: form.tensao?.value || 'N/A',
            startDate: form.startDate.value,
            endDate: form.endDate.value,
            report: assayToEdit.report,
            setup: newSetup,
            status: form.status.value,
            type: 'secadora', // Sempre manter como secadora
            observacoes: form.observacoes?.value || ''
        };

        // Atualizar o ensaio
        state.scheduledAssays[assayIndex] = { ...state.scheduledAssays[assayIndex], ...updatedData };

        state.hasUnsavedChanges = true;
        ui.toggleScheduleActions(true);
        renderers.ganttInitialRenderDone = false;
        renderers.renderGanttChart();
        utils.closeModal();
        utils.showToast("Ensaio de secadora atualizado. Guarde as alterações para confirmar.");
        state.selectedAssayId = null;
    },

    /** Salva as configurações com atualização granular. */
    saveSettings: () => {
        const form = document.querySelector('#settings-form');
        if (!form) {
            // Fallback: envia todas as configurações atuais
            dataHandlers.updateSystemSettings(state.settings);
            notificationSystem.send(
                'Configurações Atualizadas',
                `✅ Configurações aplicadas (fallback sem validação).`,
                'success'
            );
            return;
        }

        // Coleta os e-mails da lista renderizada na tela, que é mais confiável
        let currentEmails = '';
        const emailListItems = document.querySelectorAll('#email-list li span:first-child');
        if (emailListItems.length > 0) {
            currentEmails = Array.from(emailListItems).map(span => span.textContent.trim()).join(',');
        } else {
            currentEmails = state.settings.notificationEmail || '';
        }

        // Coleta dados do formulário com tolerância a diferentes nomes/ids
        const calibrationDaysInput = form.querySelector('[name="calibrationAlertDays"]') || document.getElementById('setting-calibration-threshold');
        const alertThresholdInput = form.alertThreshold || document.getElementById('setting-threshold');

        const formData = {
            notificationEmail: form.notificationEmail?.value?.trim() || state.settings.notificationEmail,
            alertThreshold: alertThresholdInput?.value ?? state.settings.alertThreshold,
            calibrationAlertDays: calibrationDaysInput?.value ?? state.settings.calibrationAlertDays,
            schedulePassword: form.schedulePassword?.value || state.settings.schedulePassword
        };

        // Validação
        const errors = validator.validateSettings(formData);
        if (errors.length > 0) {
            validator.displayErrors(errors, form);
            return;
        }

        // Calcula apenas chaves alteradas
        const changes = {};
        const prev = { ...state.settings };
        const parsedAlertThreshold = parseInt(formData.alertThreshold, 10);
        const parsedCalibrationDays = parseInt(formData.calibrationAlertDays, 10);

        if (formData.notificationEmail !== prev.notificationEmail) {
            changes.notificationEmail = formData.notificationEmail;
        }
        if (!Number.isNaN(parsedAlertThreshold) && parsedAlertThreshold !== prev.alertThreshold) {
            changes.alertThreshold = parsedAlertThreshold;
        }
        if (!Number.isNaN(parsedCalibrationDays) && parsedCalibrationDays !== prev.calibrationAlertDays) {
            changes.calibrationAlertDays = parsedCalibrationDays;
        }
        if (formData.schedulePassword !== prev.schedulePassword) {
            changes.schedulePassword = formData.schedulePassword;
        }

        // Se nada mudou, evita envio desnecessário
        if (Object.keys(changes).length === 0) {
            utils.showToast('Nenhuma alteração nas configurações para salvar.');
            return;
        }

        // Envia apenas alterações
        dataHandlers.updateSystemSettings(changes);

        // Atualiza estado local após envio
        state.settings = { ...state.settings, ...changes };

        notificationSystem.send(
            'Configurações Atualizadas com Sucesso',
            `✅ OPERAÇÃO CONCLUÍDA: Configurações alteradas foram salvas e aplicadas.`,
            'success'
        );
    },

    /**
     * Manipula a geração de relatório em PDF.
     * @param {Event} e - Evento do formulário
     */
    handleGeneratePdfReport: (e) => {
        e.preventDefault();
        const form = e.target;
        
        const startDate = form.startDate.value;
        const endDate = form.endDate.value;
        
        if (!startDate || !endDate) {
            utils.showToast('Por favor, selecione as datas de início e fim.', true);
            return;
        }
        
        if (new Date(startDate) > new Date(endDate)) {
            utils.showToast('A data de início não pode ser posterior à data de fim.', true);
            return;
        }
        
        // Mostra loading
        utils.showLoading();
        
        // Prepara dados da requisição (apenas datas - dados serão lidos do database.json)
        const requestData = {
            startDate,
            endDate,
            timestamp: new Date().toISOString()
        };
        
        console.log('Enviando requisição de relatório:', {
            startDate: requestData.startDate,
            endDate: requestData.endDate,
            note: 'Dados serão carregados do database.json no backend'
        });
        
        // Envia comando para gerar PDF
        vscode.postMessage({
            command: 'generatePdfReport',
            data: requestData
        });
        
        utils.closeModal();
        utils.showToast('Gerando relatório PDF... Aguarde.');
    },
    
    /**
     * Processa a exclusão em massa de dados.
     */
    handleBulkDelete: (e) => {
        e.preventDefault();
        
        const form = e.target;
        const startDate = form.startDate.value;
        const endDate = form.endDate.value;
        const confirmation = form.confirmation.value;
        
        // Validações
        if (!startDate || !endDate) {
            utils.showToast('Por favor, selecione as datas de início e fim.', true);
            return;
        }
        
        if (new Date(startDate) > new Date(endDate)) {
            utils.showToast('A data de início não pode ser posterior à data de fim.', true);
            return;
        }
        
        if (confirmation !== 'EXCLUIR') {
            utils.showToast('Digite "EXCLUIR" para confirmar a operação.', true);
            return;
        }
        
        // Verifica se é administrador
        if (!state.currentUser || state.currentUser.type !== 'administrador') {
            utils.showToast('Apenas administradores podem realizar exclusão em massa.', true);
            return;
        }
        
        // Obtém os itens a serem excluídos
        const itemsToDelete = modalHandlers.getItemsInDateRange(startDate, endDate);
        
        // Calcula o total de itens
        const totalItems = itemsToDelete.scheduledAssays.length + 
                          itemsToDelete.safetyScheduledAssays.length + 
                          itemsToDelete.historicalAssays.length + 
                          itemsToDelete.holidays.length + 
                          itemsToDelete.calibrations.length;
        
        if (totalItems === 0) {
            utils.showToast('Nenhum item encontrado no período selecionado.', true);
            return;
        }
        
        // Salva estado para undo
        undoManager.saveState();
        
        // Remove os itens dos arrays
        const idsToRemove = {
            scheduledAssays: itemsToDelete.scheduledAssays.map(item => item.id),
            safetyScheduledAssays: itemsToDelete.safetyScheduledAssays.map(item => item.id),
            historicalAssays: itemsToDelete.historicalAssays.map(item => item.id),
            holidays: itemsToDelete.holidays.map(item => item.id),
            calibrations: itemsToDelete.calibrations.map(item => item.id)
        };
        
        // Filtra os arrays removendo os itens selecionados
        state.scheduledAssays = state.scheduledAssays.filter(item => !idsToRemove.scheduledAssays.includes(item.id));
        state.safetyScheduledAssays = state.safetyScheduledAssays.filter(item => !idsToRemove.safetyScheduledAssays.includes(item.id));
        state.historicalAssays = state.historicalAssays.filter(item => !idsToRemove.historicalAssays.includes(item.id));
        state.holidays = state.holidays.filter(item => !idsToRemove.holidays.includes(item.id));
        state.calibrations = state.calibrations.filter(item => !idsToRemove.calibrations.includes(item.id));
        
        // Envia comando para o backend processar a exclusão
        console.log('🔍 Enviando comando bulkDelete para o backend:', { startDate, endDate });
        vscode.postMessage({
            command: 'bulkDelete',
            data: {
                startDate: startDate,
                endDate: endDate
            }
        });
        
        // Fecha o modal
        utils.closeModal();
        
        // Mostra mensagem de processamento
        utils.showToast('Processando exclusão em massa... Aguarde.');
    },

    /**
     * Adiciona um novo ensaio de secadoras ao cronograma.
     * @param {Event} e - O evento de submissão do formulário.
     */
    handleAddDryerAssay: (e) => {
        undoManager.saveState();
        e.preventDefault();
        const form = e.target;
        const startDateInput = form.querySelector('[name="startDate"]');
        const orcamentoInput = form.querySelector('[name="orcamento"]');
        const modelInput = form.querySelector('[name="model"]');
        const assayManufacturerInput = form.querySelector('[name="assayManufacturer"]');
        const umidadeInput = form.querySelector('[name="humidity"]');
        const endDateInput = form.querySelector('[name="endDate"]');
        const protocolInput = form.querySelector('[name="protocol"]');
        const nominalLoadInput = form.querySelector('[name="nominalLoad"]');
        const tensaoInput = form.querySelector('[name="tensao"]');
        const setupInput = form.querySelector('[name="setup"]');
        const observacoesInput = form.querySelector('[name="observacoes"]');
        const cyclesInput = form.querySelector('[name="cycles"]');
        const reportDateInput = form.querySelector('[name="reportDate"]');

        if (!protocolInput.value || !startDateInput.value || !endDateInput.value || !setupInput.value || !umidadeInput.value) {
            utils.showToast('Erro: Por favor, preencha todos os campos obrigatórios.', true);
            return;
        }

        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        if (new Date(endDate) < new Date(startDate)) {
            utils.showToast('A data de fim não pode ser anterior à data de início.', true);
            return;
        }

        const newAssay = {
            id: Date.now(),
            protocol: protocolInput.value,
            orcamento: orcamentoInput?.value || 'N/A',
            model: modelInput?.value || 'N/A',
            assayManufacturer: assayManufacturerInput?.value || 'N/A',
            humidity: umidadeInput.value,
            nominalLoad: parseFloat(nominalLoadInput?.value) || 0,
            tensao: tensaoInput.value,
            startDate: startDate,
            endDate: endDate,
            reportDate: reportDateInput?.value || '',
            setup: parseInt(setupInput.value, 10),
            status: 'aguardando',
            type: 'secadora',
            report: 'Pendente',
            observacoes: observacoesInput?.value || '',
            cycles: parseInt(cyclesInput?.value) || 0,
            plannedSuppliers: {
                poBase: '',
                taed: ''
            }
        };

        state.scheduledAssays.push(newAssay);
        state.hasUnsavedChanges = true;
        ui.toggleScheduleActions(true);
        renderers.renderGanttChart();
        utils.closeModal();
        utils.showToast("Ensaio de secadora adicionado. Guarde as alterações para confirmar.");

        setTimeout(() => {
            renderers.renderGanttChart();
        }, 50);
    }
};

/**
 * Funções para gerenciamento de modais.
 */
const modalHandlers = {
    openAddGanttAssayModal: () => {
    utils.openModal('Adicionar Tarefa ao Cronograma', document.getElementById('add-gantt-assay-modal-content')?.innerHTML, () => {
        const form = document.getElementById('form-add-gantt-assay');
        if (form) {
            renderers.populateTerminalSelects(form);
            const linkCheckbox = form.querySelector('#gantt-link-safety');
            const safetyFields = form.querySelector('#gantt-safety-fields');
            linkCheckbox?.addEventListener('change', (ev) => {
                if (ev.target.checked) {
                    safetyFields?.classList.remove('hidden');
                    renderers.populateSafetyTechnicianSelect(form);
                } else {
                    safetyFields?.classList.add('hidden');
                }
            });
            form.addEventListener('submit', dataHandlers.handleAddGanttAssay);
        }
    });
},

    /**
     * Abre o modal de adicionar ensaio de segurança.
     */
    openAddSafetyAssayModal: () => {
        const modalContent = document.getElementById('add-safety-assay-modal-content');
        if (!modalContent) {
            utils.showToast('Conteúdo do modal de ensaio de segurança não encontrado.', true);
            return;
        }
        utils.openModal('Adicionar Ensaio de Segurança', modalContent.innerHTML, () => {
            const form = document.getElementById('form-add-safety-assay');
            if (form) {
                renderers.populateSafetySelects(form); // <-- ADICIONAR AQUI
                form.addEventListener('submit', dataHandlers.handleAddSafetyAssay);
            }
        });
    },

    openLinkEfficiencyToSafetyModal: (efficiencyId) => {
        const today = new Date();
        const eligible = (state.safetyScheduledAssays || []).filter(a => {
            const start = utils.parseDate(a.startDate);
            const isFuture = start >= new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const status = String(a.status || '').toLowerCase();
            const notFinished = !['concluido','incompleto','relatorio'].includes(status);
            return isFuture && notFinished;
        });
        const options = eligible.length > 0
            ? eligible.map(a => `<option value="${a.id}">${a.protocol} (${utils.formatDate(a.startDate)} a ${utils.formatDate(a.endDate)})</option>`).join('')
            : '<option value="" disabled>Nenhum ensaio de segurança elegível</option>';
        const content = `
            <form id="form-link-efficiency-safety" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Ensaio de Segurança</label>
                    <select name="safetyId" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500">${options}</select>
                </div>
                <div class="flex justify-end space-x-2 pt-4">
                    <button type="button" class="btn-close-modal bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg">Cancelar</button>
                    <button type="submit" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">Vincular</button>
                </div>
            </form>
        `;
        utils.openModal('Vincular Eficiência à Segurança', content, () => {
            const form = document.getElementById('form-link-efficiency-safety');
            form?.addEventListener('submit', (e) => {
                e.preventDefault();
                const safetySelect = form.querySelector('[name="safetyId"]');
                const safetyId = parseInt(safetySelect.value, 10);
                if (!safetyId || !eligible.find(a => a.id === safetyId)) {
                    utils.showToast('Selecione um ensaio de segurança elegível.', true);
                    return;
                }
                const eff = state.scheduledAssays.find(a => a.id === efficiencyId);
                const saf = state.safetyScheduledAssays.find(a => a.id === safetyId);
                if (!eff || !saf) return;
                eff.observacoes = ((eff.observacoes || '') + ` [link_safety:${safetyId}]`).trim();
                saf.observacoes = ((saf.observacoes || '') + ` [link_efficiency:${efficiencyId}]`).trim();
                state.assayLinks.push({ from: efficiencyId, to: safetyId });
                state.hasUnsavedChanges = true;
                ui.toggleScheduleActions(true);
                renderers.renderGanttChart();
                utils.closeModal();
                utils.showToast('Vínculo criado. Guarde as alterações para confirmar.');
            });
            const cancelBtn = form?.querySelector('.btn-close-modal');
            cancelBtn?.addEventListener('click', utils.closeModal);
        });
    },

    /**
     * Abre o modal de adicionar ensaio.
     */
    openAddAssayModal: () => {
        utils.openModal('Registrar Novo Ensaio', document.getElementById('add-assay-modal-content')?.innerHTML, () => {
            const form = document.getElementById('form-add-assay');
            if (!form) return;
            const lotsContainer = document.getElementById('lots-container');

            // Função para gerar os campos de lote
            const generateLotFields = (reagentKey, reagentName) => {
                const lotsHtml = state.inventory
                    .filter(item => item.reagent === reagentName)
                    .map(item => {
                    const unit = item.reagent === 'Tiras de sujidade' ? 'un' : 'g';
                    return `<option value="${item.lot}">${item.lot} (${item.quantity.toLocaleString('pt-BR')} ${unit})</option>`;
                    })
                    .join('');

                return `
                    <div class="lote-container space-y-2 border-b pb-4 mb-4" data-reagent-type="${reagentKey}">
                        <h4 class="font-semibold text-gray-700">${reagentName}</h4>
                        <div class="lote-entry flex items-center space-x-2">
                            <select name="lote" class="flex-1 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                                <option value="">Selecione o lote</option>
                                ${lotsHtml}
                            </select>
                            <input type="number" name="cycles" placeholder="Ciclos" class="w-20 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <button type="button" class="btn-add-lote text-sm text-blue-500 hover:text-blue-700">Adicionar outro lote</button>
                    </div>
                `;
            };
            
            // Renderiza os campos de lote para cada reagente
            lotsContainer.innerHTML = `
                ${generateLotFields('poBase', 'Pó Base')}
                ${generateLotFields('perborato', 'Perborato')}
                ${generateLotFields('taed', 'TAED')}
                ${generateLotFields('tiras', 'Tiras de sujidade')}
            `;

            // Adiciona a lógica para adicionar e remover campos de lote dinamicamente
            form.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-add-lote')) {
                    const container = e.target.closest('.lote-container');
                    const reagentType = container.dataset.reagentType;
                    
                    // Mapear reagentType para reagentName
                    const reagentNameMap = {
                        'poBase': 'Pó Base',
                        'perborato': 'Perborato',
                        'taed': 'TAED',
                        'tiras': 'Tiras de sujidade'
                    };
                    const reagentName = reagentNameMap[reagentType];
                    
                    // Gerar opções limpas sem seleções
                    const cleanOptions = state.inventory
                        .filter(item => item.reagent === reagentName)
                    .map(item => {
                    const unit = item.reagent === 'Tiras de sujidade' ? 'un' : 'g';
                    return `<option value="${item.lot}">${item.lot} (${item.quantity.toLocaleString('pt-BR')} ${unit})</option>`;
                    })
                    .join('');
                    
                    const newEntry = document.createElement('div');
                    newEntry.className = 'lote-entry flex items-center space-x-2 mt-2';
                    newEntry.innerHTML = `
                        <select name="lote" class="flex-1 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Selecione o lote</option>
                            ${cleanOptions}
                        </select>
                        <input type="number" name="cycles" placeholder="Ciclos" class="w-20 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                        <button type="button" class="btn-remove-lote text-red-500 hover:text-red-700">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `;
                    e.target.before(newEntry);
                }
                if (e.target.classList.contains('btn-remove-lote') || e.target.closest('.btn-remove-lote')) {
                    const button = e.target.classList.contains('btn-remove-lote') ? e.target : e.target.closest('.btn-remove-lote');
                    button.closest('.lote-entry').remove();
                }
            });

            if (form) {
                form.addEventListener('submit', dataHandlers.handleAddAssay);
                
                // Adiciona event listener para o botão cancelar
                const cancelButton = form.querySelector('.btn-close-modal');
                if (cancelButton) {
                    cancelButton.addEventListener('click', () => {
                        utils.closeModal();
                    });
                }
            } else {
                console.error('Formulário form-add-assay não encontrado');
            }
        });
    },

    openEditSafetyAssayModal: (assayId) => {
    const assayToEdit = state.safetyScheduledAssays.find(a => a.id === assayId);
    if (!assayToEdit) {
        utils.showToast("Erro: Ensaio de segurança não encontrado.", true);
        return;
    }

    state.selectedAssayId = assayId;
    const modalContentTemplate = document.getElementById('add-safety-assay-modal-content');
    if (!modalContentTemplate) return;

    utils.openModal('Editar Ensaio de Segurança', modalContentTemplate.innerHTML, () => {
        const form = document.getElementById('form-add-safety-assay');
        if (!form) return;

        renderers.populateSafetySelects(form);

        // Preenche o formulário com os dados existentes
        form.protocol.value = assayToEdit.protocol || '';
        form.orcamento.value = assayToEdit.orcamento || '';
        form.assayManufacturer.value = assayToEdit.assayManufacturer || '';
        form.model.value = assayToEdit.model || '';
        form.nominalLoad.value = assayToEdit.nominalLoad || 0;
        form.tensao.value = assayToEdit.tensao || '';
        form.startDate.value = assayToEdit.startDate || '';
        form.endDate.value = assayToEdit.endDate || '';
        form.setup.value = assayToEdit.setup || 'A';
        form.status.value = assayToEdit.status || 'aguardando';
        form.reportDate.value = assayToEdit.reportDate || '';
        form.type.value = assayToEdit.type || '';
        form.observacoes.value = utils.stripLinkTags(assayToEdit.observacoes) || '';
        

        // Altera o botão de "Agendar" para "Salvar"
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Salvar Alterações';
            submitButton.classList.remove('bg-gray-600', 'hover:bg-gray-700');
            submitButton.classList.add('bg-green-600', 'hover:bg-green-700');
        }

        // Remove o listener de 'add' e adiciona o de 'update'
        form.removeEventListener('submit', dataHandlers.handleAddSafetyAssay);
        form.addEventListener('submit', dataHandlers.handleUpdateSafetyAssay);
    });
},
    /**
     * Abre o modal de edição de insumos.
     * @param {number} reagentId - O ID do insumo a ser editado.
     */
    openEditReagentModal: (reagentId) => {
        const reagentToEdit = state.inventory.find(item => item.id === reagentId);
        if (!reagentToEdit) {
            utils.showToast("Erro: Insumo não encontrado.", true);
            return;
        }
        state.selectedReagentId = reagentId;
        utils.openModal('Editar Insumo', document.getElementById('add-reagent-modal-content').innerHTML, () => {
            const form = document.getElementById('form-add-reagent');
            if (!form) return;
            form.reagent.value = reagentToEdit.reagent;
            form.manufacturer.value = reagentToEdit.manufacturer;
            form.lot.value = reagentToEdit.lot;
            form.quantity.value = reagentToEdit.quantity;
            form.validity.value = reagentToEdit.validity;
            const submitButton = form.querySelector('button[type="submit"]');
            submitButton.textContent = 'Salvar Alterações';
            submitButton.classList.remove('bg-green-500', 'hover:bg-green-600');
            submitButton.classList.add('bg-blue-500', 'hover:bg-blue-600');
            form.removeEventListener('submit', dataHandlers.handleAddReagent);
            form.addEventListener('submit', dataHandlers.handleUpdateReagent);
        });
    },
    openEditEmailModal: (currentEmail) => {
        const contentHTML = `
            <form id="form-edit-email" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">E-mail</label>
                    <input type="email" name="email" value="${currentEmail}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500" required>
                </div>
                <div class="flex justify-end space-x-2 pt-4">
                    <button type="button" class="btn-close-modal bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg">Cancelar</button>
                    <button type="submit" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">Salvar</button>
                </div>
            </form>
        `;
        utils.openModal('Editar E-mail', contentHTML, () => {
            const form = document.getElementById('form-edit-email');
            form?.addEventListener('submit', (e) => {
                e.preventDefault();
                const newEmail = form.querySelector('[name="email"]').value.trim();
                dataHandlers.saveEditedEmail(currentEmail, newEmail);
            });
            const cancelBtn = form?.querySelector('.btn-close-modal');
            cancelBtn?.addEventListener('click', utils.closeModal);
        });
    },
    openEditHolidayModal: (holidayId) => {
        const holiday = state.holidays.find(h => h.id === holidayId);
        if (!holiday) return;
        const contentHTML = `
            <form id="form-edit-holiday" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Nome</label>
                    <input type="text" name="name" value="${holiday.name}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500" required>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Data Inicial</label>
                        <input type="date" name="startDate" value="${holiday.startDate}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500" required>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Data Final</label>
                        <input type="date" name="endDate" value="${holiday.endDate}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500" required>
                    </div>
                </div>
                <div class="flex justify-end space-x-2 pt-4">
                    <button type="button" class="btn-close-modal bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg">Cancelar</button>
                    <button type="submit" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">Salvar</button>
                </div>
            </form>
        `;
        utils.openModal('Editar Feriado', contentHTML, () => {
            const form = document.getElementById('form-edit-holiday');
            form?.addEventListener('submit', (e) => {
                e.preventDefault();
                const updated = {
                    id: holidayId,
                    name: form.querySelector('[name="name"]').value.trim(),
                    startDate: form.querySelector('[name="startDate"]').value,
                    endDate: form.querySelector('[name="endDate"]').value
                };
                dataHandlers.saveEditedHoliday(updated);
            });
            const cancelBtn = form?.querySelector('.btn-close-modal');
            cancelBtn?.addEventListener('click', utils.closeModal);
        });
    },
    openAddHolidayModal: (prefill) => {
        const contentHTML = `
            <form id="form-add-holiday" class="space-y-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Nome do Feriado</label>
                    <input type="text" name="holidayName" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-black" required />
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Data de Início</label>
                        <input type="date" name="startDate" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-black" required />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Data de Fim</label>
                        <input type="date" name="endDate" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-black" required />
                    </div>
                </div>
                <div class="flex justify-end gap-2">
                    <button type="button" class="btn-close-modal bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg">Cancelar</button>
                    <button type="submit" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">Adicionar</button>
                </div>
            </form>
        `;
        utils.openModal('Agendar Feriado', contentHTML, () => {
            const form = document.getElementById('form-add-holiday');
            if (!form) return;
            if (prefill) {
                const sd = typeof prefill === 'string' ? prefill : prefill.startDate;
                const ed = typeof prefill === 'string' ? prefill : prefill.endDate;
                if (sd) form.startDate.value = sd;
                if (ed) form.endDate.value = ed;
            }
            form.addEventListener('submit', dataHandlers.handleAddHoliday);
            const cancelBtn = form.querySelector('.btn-close-modal');
            cancelBtn?.addEventListener('click', utils.closeModal);
        });
    },
    openAddScheduleEventModal: (prefill) => {
        const tpl = document.getElementById('add-schedule-event-modal-content');
        if (!tpl) return;
        utils.openModal('Agendar Evento', tpl.innerHTML, () => {
            const form = document.getElementById('form-add-schedule-event');
            if (!form) return;
            if (prefill) {
                const sd = typeof prefill === 'string' ? prefill : prefill.startDate;
                const ed = typeof prefill === 'string' ? prefill : prefill.endDate;
                if (sd) form.startDate.value = sd;
                if (ed) form.endDate.value = ed;
            }
            form.addEventListener('submit', dataHandlers.handleAddScheduleEvent);
            const cancelBtn = form.querySelector('.btn-close-modal');
            cancelBtn?.addEventListener('click', utils.closeModal);
        });
    },
    openEditScheduleEventModal: (eventId) => {
        const evt = state.events.find(e => Number(e.id) === Number(eventId));
        if (!evt) return;
        const tpl = document.getElementById('edit-schedule-event-modal-content');
        if (!tpl) return;
        utils.openModal('Editar Evento', tpl.innerHTML, () => {
            const form = document.getElementById('form-edit-schedule-event');
            if (!form) return;
            form.id.value = evt.id;
            form.title.value = evt.title || '';
            form.type.value = evt.type || '';
            form.description.value = evt.description || '';
            form.startDate.value = evt.startDate || '';
            form.endDate.value = evt.endDate || '';
            form.addEventListener('submit', dataHandlers.handleUpdateScheduleEvent);
            const cancelBtn = form.querySelector('.btn-close-modal');
            cancelBtn?.addEventListener('click', utils.closeModal);
        });
    },
    openViewScheduleEventModal: (eventId) => {
        const evt = state.events.find(e => Number(e.id) === Number(eventId));
        if (!evt) return;
        const tpl = document.getElementById('view-schedule-event-modal-content');
        if (!tpl) return;
        utils.openModal(`Evento: ${evt.title}`, tpl.innerHTML, () => {
            const modal = document.querySelector('#modal-template');
            modal.querySelector('[data-field="title"]').textContent = evt.title || '';
            modal.querySelector('[data-field="type"]').textContent = evt.type || '';
            modal.querySelector('[data-field="period"]').textContent = `${utils.formatDate(evt.startDate)} a ${utils.formatDate(evt.endDate)}`;
            modal.querySelector('[data-field="description"]').textContent = evt.description || '';
            const closeBtn = modal.querySelector('.btn-close-modal');
            closeBtn?.addEventListener('click', utils.closeModal);
        });
    },
    openEditSystemUserModal: (username) => {
        const user = state.systemUsers?.[username];
        if (!user) return;
        const contentHTML = `
            <form id="form-edit-system-user" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Matrícula</label>
                    <input type="text" name="username" value="${username}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500" disabled>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Nome de Exibição</label>
                    <input type="text" name="displayName" value="${user.displayName}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500" required>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Tipo</label>
                    <select name="type" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500" required>
                        <option value="administrador" ${user.type==='administrador'?'selected':''}>Administrador</option>
                        <option value="tecnico_eficiencia" ${user.type==='tecnico_eficiencia'?'selected':''}>Técnico de Eficiência</option>
                    </select>
                </div>
                <div class="flex justify-end space-x-2 pt-4">
                    <button type="button" class="btn-close-modal bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg">Cancelar</button>
                    <button type="submit" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">Salvar</button>
                </div>
            </form>
        `;
        utils.openModal('Editar Usuário', contentHTML, () => {
            const form = document.getElementById('form-edit-system-user');
            form?.addEventListener('submit', (e) => {
                e.preventDefault();
                const displayName = form.querySelector('[name="displayName"]').value.trim();
                const type = form.querySelector('[name="type"]').value;
                dataHandlers.saveEditedSystemUser(username, { displayName, type });
            });
            const cancelBtn = form?.querySelector('.btn-close-modal');
            cancelBtn?.addEventListener('click', utils.closeModal);
        });
    },
    openViewGanttCalibrationModal: (calibrationId) => {
    const calib = state.calibrations.find(c => c.id === calibrationId);
    if (!calib) return utils.showToast("Erro: Calibração não encontrada.", true);

    const modalContent = document.getElementById('view-calibration-modal-content').innerHTML;
    utils.openModal(`Detalhes: ${calib.protocol}`, modalContent, () => {
        // Preenche os detalhes (esta parte pode ser expandida se necessário)
        const modal = document.querySelector('#modal-template');
        modal.querySelector('[data-field="protocol"]').textContent = calib.protocol;
        modal.querySelector('[data-field="period"]').textContent = `${utils.formatDate(calib.startDate)} a ${utils.formatDate(calib.endDate)}`;

        // Adiciona listeners aos botões
        modal.querySelector('.btn-edit-gantt-calibration').addEventListener('click', (e) => {
            e.stopPropagation();
            modalHandlers.openEditCalibrationModal(calibrationId);
        });
        modal.querySelector('.btn-delete-gantt-calibration').addEventListener('click', (e) => {
            e.stopPropagation();
            const message = `Tem a certeza de que deseja excluir a calibração "${calib.protocol}"?`;
            ui.showConfirmationModal(message, () => {
                dataHandlers.handleDeleteGanttItem(calibrationId);
            });
        });
    });
},

openEditCalibrationModal: (calibrationId) => {
    const calib = state.calibrations.find(c => c.id === calibrationId);
    if (!calib) return utils.showToast("Erro: Calibração não encontrada.", true);

    const modalContent = document.getElementById('edit-calibration-modal-content').innerHTML;
    utils.openModal(`Editar Calibração: ${calib.protocol}`, modalContent, () => {
        const form = document.getElementById('form-edit-calibration');
        if (!form) return;
        
        // Preenche o formulário
        form.id.value = calib.id;
        form.calibrationType.value = calib.type;
        form.startDate.value = calib.startDate;
        form.endDate.value = calib.endDate;
        if (form.affectedTerminals) {
            form.affectedTerminals.value = calib.affectedTerminals || '1-4';
        }

        form.addEventListener('submit', dataHandlers.handleUpdateCalibration);
    });
},

    /**
     * Abre o modal de visualização de ensaio.
     * @param {number} assayId - O ID do ensaio a ser visualizado.
     */
    openViewAssayModal: (assayId) => {
        const assay = state.historicalAssays.find(a => Number(a.id) === Number(assayId));
        if (!assay) return;
        const modalContentTemplate = document.getElementById('view-assay-modal-content');
        if (!modalContentTemplate) return;
        const modalHTML = modalContentTemplate.innerHTML;
        utils.openModal(`Detalhes do Ensaio: ${assay.protocol}`, modalHTML, () => {
            const protocolEl = document.querySelector('[data-field="protocol"]');
            if (protocolEl) protocol.textContent = assay.protocol;
            const statusEl = document.querySelector('[data-field="status"]');
            if (statusEl) statusEl.textContent = assay.status;
            const setupEl = document.querySelector('[data-field="setup"]');
            if (setupEl) setupEl.textContent = assay.setup || 'N/A';
            const nominalLoadEl = document.querySelector('[data-field="nominalLoad"]');
            if (nominalLoadEl) nominalLoadEl.textContent = assay.nominalLoad;
            const manufacturerEl = document.querySelector('[data-field="assayManufacturer"]');
            if (manufacturerEl) manufacturerEl.textContent = assay.assayManufacturer;
            const tensaoEl = document.querySelector('[data-field="tensao"]');
            if (tensaoEl) tensaoEl.textContent = assay.tensao ? `${assay.tensao}` : 'N/A';
            const modelEl = document.querySelector('[data-field="model"]');
            if (modelEl) modelEl.textContent = assay.model;
            const periodEl = document.querySelector('[data-field="period"]');
            if (periodEl) periodEl.textContent = `${assay.startDate} a ${assay.endDate}`;
            const startBtn = document.querySelector('.btn-start-assay-from-modal');
            const editBtn = document.querySelector('.btn-edit-assay-from-modal');
            const deleteBtn = document.querySelector('.btn-delete-assay-from-modal');
            const addReportBtn = document.querySelector('.btn-open-report-modal-from-modal');
            if (startBtn) startBtn.classList.add('hidden');
            if (editBtn) editBtn.classList.add('hidden');
            if (addReportBtn) addReportBtn.classList.add('hidden');
            if (assay.status === 'Planejado') {
                if (startBtn) startBtn.classList.remove('hidden');
                if (editBtn) editBtn.classList.remove('hidden');
            } else if (assay.status === 'Em Andamento') {
                if (addReportBtn) addReportBtn.classList.remove('hidden');
            }
            if (startBtn) startBtn.addEventListener('click', () => {
                dataHandlers.handleUpdateAssayStatus(assay.id, 'Em Andamento');
                utils.closeModal();
            });
            if (addReportBtn) addReportBtn.addEventListener('click', () => {
                utils.closeModal();
                state.selectedAssayId = assay.id;
                utils.openModal('Adicionar Relatório', document.getElementById('add-report-modal-content').innerHTML, () => {
                    document.getElementById('form-add-report')?.addEventListener('submit', dataHandlers.handleSaveReport);
                });
            });
            if (editBtn) editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                utils.closeModal();
                modalHandlers.openEditAssayModal(assay.id);
            });
            if (deleteBtn) deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                utils.closeModal();
                
            });
        });
    },

    /**
     * Abre o modal de visualização de calibração.
     * @param {number} calibrationId - O ID da calibração a ser visualizada.
     */
    openViewGanttCalibrationModal: (calibrationId) => {
    const calib = state.calibrations.find(c => c.id === calibrationId);
    if (!calib) {
        return utils.showToast("Erro: Calibração não encontrada.", true);
    }

    const modalTitle = `Detalhes: Calibração`;
    const modalContentHTML = `
        <div class="space-y-4 text-sm text-gray-700">
            <p>
                <span class="font-semibold">Tipo de Calibração:</span>
                ${calib.protocol || 'N/A'}
            </p>
            <p>
                <span class="font-semibold">Período:</span>
                ${utils.formatDate(calib.startDate)} a ${utils.formatDate(calib.endDate)}
            </p>
            <p>
                <span class="font-semibold">Terminais Afetados:</span>
                ${calib.affectedTerminals || 'Todos'}
            </p>
            ${calib.notes ? `<p><span class="font-semibold">Observações:</span> ${calib.notes}</p>` : ''}

            <div class="flex justify-end space-x-2 pt-4 border-t">
                <button class="btn-edit-gantt-calibration bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Editar
                </button>
                <button class="btn-delete-gantt-calibration bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Excluir
                </button>
            </div>
        </div>
    `;

    const onModalOpen = () => {
        const activeModal = document.getElementById('modal-template');
        if (!activeModal) return;

        const editButton = activeModal.querySelector('.btn-edit-gantt-calibration');
        const deleteButton = activeModal.querySelector('.btn-delete-gantt-calibration');

        // Atribui o ID correto aos botões
        if (editButton) editButton.dataset.id = calib.id;
        if (deleteButton) deleteButton.dataset.id = calib.id;

        if (editButton) {
            editButton.addEventListener('click', () => {
                modalHandlers.openEditCalibrationModal(calib.id);
            });
        }

        if (deleteButton) {
            deleteButton.addEventListener('click', () => {
                const message = `Tem a certeza de que deseja excluir a calibração "${calib.protocol}"?`;
                ui.showConfirmationModal(message, () => dataHandlers.handleDeleteGanttItem(calib.id));
            });
        }
    };

    utils.openModal(modalTitle, modalContentHTML, onModalOpen);
},

    /**
     * Abre o modal de visualização de tarefa do Gantt.
     * @param {number} assayId - O ID da tarefa a ser visualizada.
     * Adicionada verificação robusta para garantir que o objeto de ensaio
     * é encontrado antes de tentar preencher o modal.
     */
    openViewGanttAssayModal: (assayId) => {
        let assay = state.scheduledAssays.find(a => Number(a.id) === Number(assayId));
        if (!assay) {
            assay = state.safetyScheduledAssays.find(a => Number(a.id) === Number(assayId));
        }
    
        // Verifica se o ensaio foi encontrado. Se não, exibe uma mensagem de erro e sai.
        if (!assay) {
            console.error(`Erro: Não foi possível encontrar o ensaio com o ID ${assayId}.`);
            utils.showToast("Erro: Tarefa não encontrada.", true);
            return;
        }

        let modalContentHTML;
        const modalTitle = `Detalhes: ${assay.protocol}`;

        // Lógica para renderizar botões dinâmicos baseados no status do ensaio
        let dynamicButtonsHTML = '';
        const status = assay.status.toLowerCase();
        
        // Requisito: Botão 'Iniciar ensaio' para status 'Amostra no LABELO'
        if (status === 'labelo') {
            dynamicButtonsHTML += `
                <button class="btn-start-assay bg-blue-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg flex items-center" data-id="${assay.id}" data-action="start-assay">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    Iniciar ensaio
                </button>
            `;
        }
        else if (status === 'aguardando') {
            dynamicButtonsHTML += `
                <button class="btn-here-assay bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 px-4 rounded-lg flex items-center" data-id="${assay.id}" data-action="start-assay">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    Amostra no Labelo
                </button>
            `;
        }
        // Requisito: Botão 'Concluir ensaio' e 'Ensaio Incompleto' para status 'Ensaios em Andamento'
        else if (status === 'andamento') {
            dynamicButtonsHTML += `
                <button class="btn-finish-assay bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg flex items-center" data-id="${assay.id}" data-status="concluido" data-action="finish-assay">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-8.87"></path><path d="M22 4L12 14.01l-3-3"></path></svg>
                    Concluir ensaio
                </button>
                <button class="btn-finish-assay bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-lg flex items-center ml-2" data-id="${assay.id}" data-status="incompleto" data-action="finish-assay">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    Ensaio Incompleto
                </button>
            `;
        }
        // Requisito: Botão 'Adicionar Relatório' para status 'Ensaios Concluído'
        else if (status === 'concluido' || status === 'incompleto') {
            dynamicButtonsHTML += `
                <button class="btn-add-report-modal bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded-lg flex items-center" data-id="${assay.id}" data-action="add-report">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    Adicionar Relatório
                </button>
            `;
        }
        

        if (assay.type === 'férias') {
            modalContentHTML = `
                <div class="space-y-4">
                    <p class="text-md">
                        <span class="font-semibold">Período:</span>
                        ${utils.formatDate(assay.startDate)} a ${utils.formatDate(assay.endDate)}
                    </p>
                    <div class="flex justify-end space-x-2 pt-4 border-t">
                        <button class="btn-edit-gantt-assay bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg flex items-center" data-id="${assay.id}" data-action="edit-gantt-assay">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            Editar
                        </button>
                        <button class="btn-delete-gantt-assay bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg flex items-center" data-id="${assay.id}" data-action="delete-gantt-assay">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            Excluir
                        </button>
                    </div>
                </div>
            `;
        } else if (assay.type === 'secadora') {
            // Usar modal específico para ensaios de secadoras
            modalHandlers.openViewDryerAssayModal(assayId);
            return;
        } else {
            modalContentHTML = `
                <div class="space-y-4 text-sm text-gray-700">
                    <p><span class="font-semibold">Protocolo:</span> ${assay.protocol || 'N/A'}</p>
                    <p><span class="font-semibold">Status:</span> ${ASSAY_STATUS_MAP[status] || assay.status}</p>
                    <p><span class="font-semibold">Período:</span> ${utils.formatDate(assay.startDate)} a ${utils.formatDate(assay.endDate)}</p>
                    <p><span class="font-semibold">Terminal:</span> ${getTerminalName(assay.setup)}</p>
                    <p><span class="font-semibold">Fabricante:</span> ${assay.assayManufacturer || 'N/A'}</p>
                    <p><span class="font-semibold">Modelo:</span> ${assay.model || 'N/A'}</p>
                    <p><span class="font-semibold">Carga Nominal:</span> ${assay.nominalLoad || 'N/A'} kg</p>
                    <p><span class="font-semibold">Orçamento:</span> ${assay.orcamento || 'N/A'}</p>
                    <p><span class="font-semibold">Tipo:</span> ${ASSAY_TYPE_MAP[assay.type] || 'N/A'}</p>
                    <p><span class="font-semibold">Data do Relatório:</span> ${assay.reportDate ? assay.reportDate.split('-').reverse().join('/') : 'N/A'}</p>
                    <p><span class="font-semibold">Relatório:</span> ${assay.report ? (assay.report === 'Pendente' ? '<span class="text-red-500">Pendente</span>' : assay.report) : '<span class="text-red-500">Pendente</span>'}</p>
                    <p><span class="font-semibold">Observações:</span> ${utils.stripLinkTags(assay.observacoes) || 'Nenhuma Observação'}</p>
                </div>
                <div class="flex justify-end space-x-2 pt-4 border-t">
                    ${dynamicButtonsHTML}
                    <button class="btn-edit-gantt-assay bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg flex items-center" data-id="${assay.id}" data-action="edit-gantt-assay">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        Editar
                    </button>
                    <button class="btn-delete-gantt-assay bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg flex items-center" data-id="${assay.id}" data-action="delete-gantt-assay">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Excluir
                    </button>
                </div>
            `;
        }

        const onModalOpen = () => {
            const activeModal = document.getElementById('modal-template');
            if (!activeModal) return;

            // Adiciona listeners para os botões dinâmicos
            const startButton = activeModal.querySelector('.btn-start-assay');
            if (startButton) {
                startButton.addEventListener('click', () => {
                    dataHandlers.handleStartAssay(assayId);
                    utils.closeModal();
                });
            }
            const hereButton = activeModal.querySelector('.btn-here-assay');
            if (hereButton) {
                hereButton.addEventListener('click', () => {
                    dataHandlers.handleHereAssay(assayId);
                    utils.closeModal();
                });
            }

            const finishButtons = activeModal.querySelectorAll('.btn-finish-assay');
            finishButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const status = btn.dataset.status;
                    if (status === 'concluido') {
                        if (assay.type === 'seguranca-eletrica') {
                            // Para ensaios de segurança, concluir abre o modal de relatório
                            modalHandlers.openReportModalGantt(assayId);
                        } else {
                            // Para ensaios de eficiência, seguir fluxo padrão de conclusão
                            modalHandlers.openFinishAssayModal(assayId, status);
                        }
                    } else {
                        modalHandlers.openFinishAssayModal(assayId, status);
                    }
                });
            });
            
            // Listener para o novo botão "Adicionar Relatório"
            const addReportButton = activeModal.querySelector('.btn-add-report-modal');
            if (addReportButton) {
                addReportButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    modalHandlers.openReportModalGantt(assayId);
                });
            }

            // Event listeners para os botões estáticos
            const editButton = activeModal.querySelector('.btn-edit-gantt-assay');
            const deleteButton = activeModal.querySelector('.btn-delete-gantt-assay');
            
            if (editButton) {
                editButton.dataset.id = assay.id;
                editButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    utils.closeModal();
                    setTimeout(() => {
                        if (assay.type === 'férias') {
                            modalHandlers.openEditVacationModal(assay.id);
                        } else if (assay.type === 'seguranca-eletrica') {
                            // Chama a nova função de edição para ensaios de segurança
                            modalHandlers.openEditSafetyAssayModal(assay.id);
                        } else {
                            // Mantém a função antiga para os outros ensaios
                            modalHandlers.openEditGanttAssayModal(assay.id);
                        }
                    }, 50);
                });
            }

            if (deleteButton) {
                deleteButton.dataset.id = assay.id;
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const message = `Tem a certeza de que deseja excluir o ensaio "${assay.protocol}"?`;
                    ui.showConfirmationModal(message, () => {
                        utils.closeModal();
                        dataHandlers.handleDeleteGanttItem(assay.id);
                    });
                });
            }
        };
        utils.openModal(modalTitle, modalContentHTML, onModalOpen);
    },
    /**
     * Abre o modal de edição de ensaios históricos.
     * @param {number} assayId - O ID do ensaio a ser editado.
     */
    openEditAssayModal: (assayId) => {
        const assayToEdit = state.historicalAssays.find(a => a.id === assayId);
        if (!assayToEdit) {
            utils.showToast("Erro: Ensaio histórico não encontrado.", true);
            return;
        }
        state.selectedAssayId = assayId;
        
        // Modal completo de edição para ensaios históricos
        const title = `Editar Ensaio: ${assayToEdit.protocol}`;
        const contentHTML = `
            <form id="form-edit-historical-assay" class="space-y-6">
                <!-- Informações Básicas -->
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h3 class="text-lg font-bold mb-4 text-gray-800">Informações Básicas</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Protocolo *</label>
                            <input type="text" name="protocol" value="${assayToEdit.protocol || ''}" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Orçamento</label>
                            <input type="text" name="orcamento" value="${assayToEdit.orcamento || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Fabricante</label>
                            <input type="text" name="assayManufacturer" value="${assayToEdit.assayManufacturer || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Modelo</label>
                            <input type="text" name="model" value="${assayToEdit.model || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Tensão</label>
                            <select name="tensao" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500">
                                <option value="">Selecione a Tensão</option>
                                <option value="127V" ${assayToEdit.tensao == '127V' ? 'selected' : ''}>127V</option>
                                <option value="220V" ${assayToEdit.tensao == '220V' ? 'selected' : ''}>220V</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Terminal</label>
                            <select name="setup" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500">
                                <option value="">Selecione o Terminal</option>
                                <option value="1" ${assayToEdit.setup === 1 ? 'selected' : ''}>Terminal 1</option>
                                <option value="2" ${assayToEdit.setup === 2 ? 'selected' : ''}>Terminal 2</option>
                                <option value="3" ${assayToEdit.setup === 3 ? 'selected' : ''}>Terminal 3</option>
                                <option value="4" ${assayToEdit.setup === 4 ? 'selected' : ''}>Terminal 4</option>
                                <option value="5" ${assayToEdit.setup === 5 ? 'selected' : ''}>Terminal 5</option>
                                <option value="6" ${assayToEdit.setup === 6 ? 'selected' : ''}>Terminal 6</option>
                                <option value="7" ${assayToEdit.setup === 7 ? 'selected' : ''}>Terminal 7</option>
                                <option value="8" ${assayToEdit.setup === 8 ? 'selected' : ''}>Terminal 8</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Ensaio -->
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h3 class="text-lg font-bold mb-4 text-gray-800">Classificação</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Tipo de Ensaio</label>
                            <select name="type" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500">
                                <option value="homologation" ${assayToEdit.type === 'homologation' ? 'selected' : ''}>Homologação</option>
                                <option value="acp" ${assayToEdit.type === 'acp' ? 'selected' : ''}>AcP</option>
                                <option value="acreditado" ${assayToEdit.type === 'acreditado' ? 'selected' : ''}>Não Acreditado</option>
                                <option value="acao-corretiva" ${assayToEdit.type === 'acao-corretiva' ? 'selected' : ''}>Ação Corretiva</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Datas e Ciclos -->
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h3 class="text-lg font-bold mb-4 text-gray-800">Datas e Ciclos</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Data de Início</label>
                            <input type="date" name="startDate" value="${assayToEdit.startDate || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Data de Término</label>
                            <input type="date" name="endDate" value="${assayToEdit.endDate || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Carga Nominal (kg)</label>
                            <input type="number" step="0.1" name="nominalLoad" value="${assayToEdit.nominalLoad || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Total de Ciclos</label>
                            <input type="number" name="cycles" value="${assayToEdit.cycles || ''}" readonly class="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm">
                            <p class="text-xs text-gray-500 mt-1">Calculado automaticamente pelos lotes</p>
                        </div>
                    </div>
                </div>

                <!-- Lotes de Reagentes -->
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h3 class="text-lg font-bold mb-4 text-gray-800">Lotes de Reagentes Utilizados</h3>
                    <p class="text-sm text-gray-600 mb-4">Ajuste os lotes e ciclos conforme necessário. O total de ciclos será recalculado automaticamente.</p>
                    <div id="lots-container" class="space-y-4">
                        <!-- Lotes serão injetados aqui -->
                    </div>
                </div>

                <div class="flex justify-end space-x-3 pt-6 border-t">
                    <button type="button" class="btn-close-modal bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-6 rounded-lg transition duration-200">Cancelar</button>
                    <button type="submit" class="btn-submit-edit-historical-assay bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition duration-200">Salvar Alterações</button>
                </div>
            </form>
        `;

        utils.openModal(title, contentHTML, () => {
            const form = document.getElementById('form-edit-historical-assay');
            if (!form) return;
            const lotsContainer = document.getElementById('lots-container');

            // Função para gerar os campos de lote
            const generateLotFields = (reagentKey, reagentName) => {
                const lotsArray = assayToEdit.lots && assayToEdit.lots[reagentKey] ? assayToEdit.lots[reagentKey] : [];
                const lotsHtml = state.inventory
                    .filter(item => item.reagent === reagentName)
                    .map(item => {
                        const unit = item.reagent === 'Tiras de sujidade' ? 'un' : 'g';
                        return `<option value="${item.lot}">${item.lot} (${item.quantity.toLocaleString('pt-BR')} ${unit})</option>`;
                    })
                    .join('');

                let fieldsHtml = lotsArray.map(lotEntry => {
                    const lotOptions = state.inventory
                        .filter(item => item.reagent === reagentName)
                        .map(item => {
                        const unit = item.reagent === 'Tiras de sujidade' ? 'un' : 'g';
                        const isSelected = item.lot === lotEntry.lot ? 'selected' : '';
                        return `<option value="${item.lot}" ${isSelected}>${item.lot} (${item.quantity.toLocaleString('pt-BR')} ${unit})</option>`;
                    })                        
                    .join('');
                    
                    return `
                    <div class="lote-entry flex items-center space-x-2 mt-2">
                        <select name="lote" class="flex-1 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                            ${lotOptions}
                        </select>
                        <input type="number" name="cycles" placeholder="Ciclos" value="${lotEntry.cycles}" class="w-20 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                        <button type="button" class="btn-remove-lote text-red-500 hover:text-red-700">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    `;
                }).join('');

                if (lotsArray.length === 0) {
                    fieldsHtml = `
                    <div class="lote-entry flex items-center space-x-2">
                        <select name="lote" class="flex-1 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Selecione o lote</option>
                            ${lotsHtml}
                        </select>
                        <input type="number" name="cycles" placeholder="Ciclos" class="w-20 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                    </div>
                    `;
                }

                return `
                    <div class="lote-container space-y-2 border-b pb-4 mb-4" data-reagent-type="${reagentKey}">
                        <h4 class="font-semibold text-gray-700">${reagentName}</h4>
                        ${fieldsHtml}
                        <button type="button" class="btn-add-lote text-sm text-blue-500 hover:text-blue-700">Adicionar outro lote</button>
                    </div>
                `;
            };
            
            // Renderiza os campos de lote para cada reagente
            lotsContainer.innerHTML = `
                ${generateLotFields('poBase', 'Pó Base')}
                ${generateLotFields('perborato', 'Perborato')}
                ${generateLotFields('taed', 'TAED')}
                ${generateLotFields('tiras', 'Tiras de sujidade')}
            `;

            // Adiciona a lógica para adicionar e remover campos de lote dinamicamente
            form.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-add-lote')) {
                    const container = e.target.closest('.lote-container');
                    const selectElement = container.querySelector('select[name="lote"]');
                    const newEntry = document.createElement('div');
                    newEntry.className = 'lote-entry flex items-center space-x-2 mt-2';
                    newEntry.innerHTML = `
                        <select name="lote" class="flex-1 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                            ${selectElement.innerHTML}
                        </select>
                        <input type="number" name="cycles" placeholder="Ciclos" class="w-20 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                        <button type="button" class="btn-remove-lote text-red-500 hover:text-red-700">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `;
                    e.target.before(newEntry);
                }
                if (e.target.classList.contains('btn-remove-lote') || e.target.closest('.btn-remove-lote')) {
                    const button = e.target.classList.contains('btn-remove-lote') ? e.target : e.target.closest('.btn-remove-lote');
                    button.closest('.lote-entry').remove();
                }
            });

            if (form) {
                form.addEventListener('submit', (e) => dataHandlers.handleUpdateAssay(e));
                
                // Adiciona event listener para o botão cancelar
                const cancelButton = form.querySelector('.btn-close-modal');
                if (cancelButton) {
                    cancelButton.addEventListener('click', () => {
                        utils.closeModal();
                    });
                }
            } else {
                console.error('Formulário form-edit-historical-assay não encontrado');
            }
        });
    },
    /**
     * NOVA FUNÇÃO: Abre o modal para concluir ou marcar ensaio como incompleto.
     * @param {number} assayId - O ID do ensaio.
     * @param {string} newStatus - O novo status ('concluido' ou 'incompleto').
     */
    openFinishAssayModal: (assayId, newStatus) => {
    const allScheduled = [...state.scheduledAssays, ...state.safetyScheduledAssays];
    const assay = allScheduled.find(a => a.id === assayId);

    if (!assay) {
        return utils.showToast("Erro: Ensaio não encontrado no cronograma.", true);
    }

    if (assay.type === 'seguranca-eletrica') {
        undoManager.saveState();

        // 1. Encontra o ensaio diretamente na sua array original para o modificar
        const assayToUpdate = state.safetyScheduledAssays.find(a => a.id === assayId);
        if (assayToUpdate) {
            // 2. Altera o status baseado no parâmetro newStatus (incompleto ou relatório)
            if (newStatus === 'concluido') {
            assayToUpdate.status = 'relatorio';
        } else {
            assayToUpdate.status = 'incompleto';
        }
        assayToUpdate.report = 'Pendente';
        }

        // 3. Ativa o estado de "alterações não salvas"
        state.hasUnsavedChanges = true;
        ui.toggleScheduleActions(true);

        // 4. Atualiza a interface e notifica o utilizador
        renderers.renderGanttChart();
        utils.showToast('Status do ensaio de segurança atualizado. Guarde as alterações.');
        utils.closeModal(); // Garante que qualquer modal anterior seja fechado

        return; // Termina a função aqui para não abrir o modal de lotes
    }

    // O fluxo para ensaios de eficiência continua normalmente abaixo
    const title = `Concluir Ensaio: ${assay.protocol}`;
    const generateReagentFields = () => {
        // ... (esta parte não muda)
        const reagentMap = {
            'Pó Base': 'poBase',
            'Perborato': 'perborato',
            'TAED': 'taed',
            'Tiras de sujidade': 'tiras'
        };
        return Object.entries(reagentMap).map(([reagentName, reagentKey]) => {
            const lotsHtml = state.inventory
                .filter(item => item.reagent === reagentName)
                .map(item => {
                    const unit = (item.reagent === 'Tiras de sujidade') ? 'un' : 'g';
                    return `<option value="${item.lot}">${item.lot} (${item.quantity.toLocaleString('pt-BR')} ${unit})</option>`;
                })
                .join('');
            return `
                <div class="lote-container space-y-2 border-b pb-4 mb-4" data-reagent-type="${reagentKey}">
                    <h4 class="font-semibold text-gray-700">${reagentName}</h4>
                    <div class="lote-entry flex items-center space-x-2">
                        <select name="lote" class="flex-1 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Selecione o lote</option>
                            ${lotsHtml}
                        </select>
                        <input type="number" name="cycles" placeholder="Ciclos" class="w-20 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                    </div>
                    <button type="button" class="btn-add-lote text-sm text-blue-500 hover:text-blue-700">Adicionar outro lote</button>
                </div>
            `;
        }).join('');
    };
    const contentHTML = `
        <form id="form-finish-assay" class="space-y-4">
             <div>
                <h3 class="text-lg font-bold mb-2">Dados do Ensaio</h3>
                <p><span class="font-semibold">Protocolo:</span> ${assay.protocol}</p>
                <p><span class="font-semibold">Carga Nominal:</span> ${assay.nominalLoad} kg</p>
            </div>
            <hr class="my-4">
            <h3 class="text-lg font-bold mb-2">Informações da Conclusão</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Nova Data de Início</label>
                    <input type="date" name="newStartDate" value="${assay.startDate}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Nova Data de Término</label>
                    <input type="date" name="newEndDate" value="${new Date().toISOString().split('T')[0]}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500">
                </div>
            </div>
            <hr class="my-4">
            <h3 class="text-lg font-bold mb-2">Reagentes Utilizados</h3>
            <p class="text-sm text-gray-500 mb-4">Insira o lote e os ciclos para cada reagente utilizado.</p>
            ${generateReagentFields()}
            <div class="flex justify-end space-x-2 pt-4">
                <button type="button" class="btn-close-modal bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg">Cancelar</button>
                <button type="submit" class="btn-submit-finish bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">Confirmar</button>
            </div>
        </form>
    `;

    utils.openModal(title, contentHTML, () => {
        const form = document.getElementById('form-finish-assay');
        if (form) {
            form.addEventListener('submit', (e) => dataHandlers.handleFinishAssay(e, assayId, newStatus));

            const cancelButton = form.querySelector('.btn-close-modal');
            if (cancelButton) {
                cancelButton.addEventListener('click', () => {
                    utils.closeModal();
                });
            }

            form.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-add-lote')) {
                    const container = e.target.closest('.lote-container');
                    const reagentKey = container.dataset.reagentType;
                    const selectElement = container.querySelector('select[name="lote"]');
                    const newEntry = document.createElement('div');
                    newEntry.className = 'lote-entry flex items-center space-x-2 mt-2';
                    newEntry.innerHTML = `
                        <select name="lote" class="flex-1 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                            ${selectElement.innerHTML}
                        </select>
                        <input type="number" name="cycles" placeholder="Ciclos" class="w-20 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                        <button type="button" class="btn-remove-lote text-red-500 hover:text-red-700">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `;
                    e.target.before(newEntry);
                }
                if (e.target.classList.contains('btn-remove-lote') || e.target.closest('.btn-remove-lote')) {
                    const button = e.target.classList.contains('btn-remove-lote') ? e.target : e.target.closest('.btn-remove-lote');
                    button.closest('.lote-entry').remove();
                }
            });
        }
    });
},

    openReportModalGantt: (assayId) => {
        let assay = state.scheduledAssays.find(a => a.id === assayId);
        if (!assay) {
            assay = state.safetyScheduledAssays.find(a => a.id === assayId);
        }
        if (!assay) {
            utils.showToast("Erro: Ensaio não encontrado no cronograma.", true);
            return;
        }
        
        state.selectedAssayId = assayId;
        
        // Verifica se já existe relatório para determinar se é edição ou adição
        const isEditing = assay.report && assay.report !== 'Pendente';
        const title = isEditing ? `Editar Relatório: ${assay.protocol}` : `Adicionar Relatório: ${assay.protocol}`;
        const currentReport = isEditing ? assay.report : '';
        const labelText = isEditing ? 
            `Editar o número do relatório para o ensaio **${assay.protocol}**. Relatório atual: **${currentReport}**` :
            `Informe o número do relatório para o ensaio **${assay.protocol}**.`;
        const buttonText = isEditing ? 'Salvar Alterações' : 'Adicionar Relatório';
        
        const contentHTML = `
            <form id="form-add-report" class="space-y-4">
                <p class="text-sm text-gray-700">${labelText}</p>
                <div>
                    <label for="reportNumber" class="block text-sm font-medium text-gray-700">Número do Relatório</label>
                    <input type="text" id="reportNumber" name="reportNumber" value="${currentReport}" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500">
                </div>
                <div class="flex justify-end space-x-2 pt-4">
                    <button type="button" class="btn-close-modal bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg">Cancelar</button>
                    <button type="submit" class="btn-submit-report bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">${buttonText}</button>
                </div>
            </form>
        `;

        utils.openModal(title, contentHTML, () => {
            const form = document.getElementById('form-add-report');
            if (!form) return;
            form.addEventListener('submit', (e) => dataHandlers.handleSaveReportModal(e, assayId));
            
            // Adiciona event listener para o botão cancelar
            const cancelButton = form.querySelector('.btn-close-modal');
            if (cancelButton) {
                cancelButton.addEventListener('click', () => {
                    utils.closeModal();
                });
            }
        });
    },

    /**
     * Abre o modal de edição de tarefas do Gantt.
     * @param {number} assayId - O ID da tarefa a ser editada.
     */
    openEditGanttAssayModal: (assayId) => {
        let assayToEdit = state.scheduledAssays.find(a => a.id === assayId);
        if (!assayToEdit) {
            assayToEdit = state.safetyScheduledAssays.find(a => a.id === assayId);
        }
        if (!assayToEdit) {
            utils.showToast("Erro: Tarefa do cronograma não encontrada.", true);
            return;
        }
        
        // Se for ensaio de secadora, usar modal específico
        if (assayToEdit.type === 'secadora') {
            modalHandlers.openEditDryerAssayModal(assayId);
            return;
        }
        
        state.selectedAssayId = assayId;
        const modalContentTemplate = document.getElementById('add-gantt-assay-modal-content');
        if (!modalContentTemplate) return;

        utils.openModal('Editar Ensaio', modalContentTemplate.innerHTML, () => {
            const form = document.getElementById('form-add-gantt-assay');
            if (!form) return;

            const isSafetyAssay = assayToEdit.type === 'seguranca-eletrica';

            if (isSafetyAssay) {
                renderers.populateSafetySelects(form);
            } else {
                renderers.populateTerminalSelects(form);
            }
            
            // Preenche o resto do formulário
            form.querySelector('[name="protocol"]').value = assayToEdit.protocol;
            form.querySelector('[name="orcamento"]').value = assayToEdit.orcamento;
            form.querySelector('[name="mainSupplier"]').value = assayToEdit.plannedSuppliers?.poBase;
            form.querySelector('[name="assayManufacturer"]').value = assayToEdit.assayManufacturer;
            form.querySelector('[name="model"]').value = assayToEdit.model;
            form.querySelector('[name="nominalLoad"]').value = assayToEdit.nominalLoad;
            form.querySelector('[name="tensao"]').value = assayToEdit.tensao;
            form.querySelector('[name="startDate"]').value = assayToEdit.startDate;
            form.querySelector('[name="endDate"]').value = assayToEdit.endDate;
            form.querySelector('[name="setup"]').value = assayToEdit.setup;
            form.querySelector('[name="status"]').value = assayToEdit.status;
            form.querySelector('[name="type"]').value = assayToEdit.type;
            form.querySelector('[name="reportDate"]').value = assayToEdit.reportDate;
            form.querySelector('[name="id"]').value = assayToEdit.id;
            form.querySelector('[name="observacoes"]').value = utils.stripLinkTags(assayToEdit.observacoes) || '';
            
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.textContent = 'Salvar Alterações';
                submitButton.classList.remove('bg-blue-600', 'hover:bg-blue-700');
                submitButton.classList.add('bg-green-600', 'hover:bg-green-700');
            }
            
            form.removeEventListener('submit', dataHandlers.handleAddGanttAssay);
            form.addEventListener('submit', dataHandlers.handleUpdateGanttAssay);
        });
    },

    /**
     * Abre o modal de edição de férias.
     * @param {number} assayId - O ID do período de férias a ser editado.
     */
    openEditVacationModal: (assayId) => {
        const vacationToEdit = state.scheduledAssays.find(a => a.id === assayId);
        if (!vacationToEdit) {
            utils.showToast("Erro: Período de férias não encontrado.", true);
            return;
        }
        state.selectedAssayId = assayId;
        const modalContentTemplate = document.getElementById('add-vacation-modal-content');
        if (!modalContentTemplate) return;
        utils.openModal('Editar Período de Férias', modalContentTemplate.innerHTML, () => {
            const form = document.getElementById('form-add-vacation');
            if (!form) return;
            form.employeeName.value = vacationToEdit.protocol.replace('Férias - ', '');
            form.startDate.value = vacationToEdit.startDate;
            form.endDate.value = vacationToEdit.endDate;
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) submitButton.textContent = 'Salvar Alterações';
            form.removeEventListener('submit', dataHandlers.handleAddVacation);
            form.addEventListener('submit', dataHandlers.handleUpdateVacation);
        });
    },

    // Modais apenas para visualização (sem botões de ação) - usados no dashboard
    openViewOnlyAssayModal: (assayId) => {
        const assay = state.scheduledAssays.find(a => a.id === assayId) || 
                     state.safetyScheduledAssays.find(a => a.id === assayId);
        if (!assay) {
            utils.showToast("Erro: Ensaio não encontrado.", true);
            return;
        }

        const title = `Detalhes do Ensaio: ${assay.protocol || assay.category}`;
        const isSafetyAssay = state.safetyScheduledAssays.some(a => a.id === assayId);
        
        let contentHTML = `
            <div class="space-y-6">
                <!-- Informações Básicas -->
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h3 class="text-lg font-bold mb-3 text-gray-800">Informações Básicas</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${isSafetyAssay ? `
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Responsável</label>
                                <p class="mt-1 text-gray-900">${(() => {
                                    const safetyCategory = state.safetyCategories.find(cat => cat.id === assay.setup);
                                    return safetyCategory ? safetyCategory.name : (assay.category || 'N/A');
                                })()}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Protocolo</label>
                                <p class="mt-1 text-gray-900">${assay.protocol || 'N/A'}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Fabricante</label>
                                <p class="mt-1 text-gray-900">${assay.assayManufacturer || 'N/A'}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Modelo</label>
                                <p class="mt-1 text-gray-900">${assay.model || 'N/A'}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Terminal</label>
                                <p class="mt-1 text-gray-900">${assay.setup || 'N/A'}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Carga Nominal</label>
                                <p class="mt-1 text-gray-900">${assay.nominalLoad || 'N/A'} kg</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Tensão</label>
                                <p class="mt-1 text-gray-900">${assay.tensao || 'N/A'}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Tipo de Ensaio</label>
                                <p class="mt-1 text-gray-900">${ASSAY_TYPE_MAP[assay.type] || assay.type || 'N/A'}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Status</label>
                                <p class="mt-1 text-gray-900">${ASSAY_STATUS_MAP[assay.status] || assay.status || 'N/A'}</p>
                            </div>
                        ` : `
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Protocolo</label>
                                <p class="mt-1 text-gray-900">${assay.protocol || 'N/A'}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Fabricante</label>
                                <p class="mt-1 text-gray-900">${assay.assayManufacturer || 'N/A'}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Modelo</label>
                                <p class="mt-1 text-gray-900">${assay.model || 'N/A'}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Terminal</label>
                                <p class="mt-1 text-gray-900">${assay.setup || 'N/A'}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Carga Nominal</label>
                                <p class="mt-1 text-gray-900">${assay.nominalLoad || 'N/A'} kg</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Tipo de Ensaio</label>
                                <p class="mt-1 text-gray-900">${ASSAY_TYPE_MAP[assay.type] || assay.type || 'N/A'}</p>
                            </div>
                        `}
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Orçamento</label>
                            <p class="mt-1 text-gray-900">${assay.orcamento || 'N/A'}</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Data de Início</label>
                            <p class="mt-1 text-gray-900">${utils.formatDate(assay.startDate)}</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Data de Término</label>
                            <p class="mt-1 text-gray-900">${utils.formatDate(assay.endDate)}</p>
                        </div>
                        ${!isSafetyAssay ? `
                        ` : ''}
                    </div>
                </div>

                <!-- Lotes de Reagentes -->
                ${safeObjectKeys(assay.lots || {}).length > 0 ? `
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <h3 class="text-lg font-bold mb-3 text-gray-800">Lotes de Reagentes</h3>
                        <div class="space-y-3">
                            ${Object.entries(assay.lots || {}).map(([reagentType, lots]) => `
                                <div>
                                    <h4 class="font-semibold text-gray-700">${REAGENT_NAMES[reagentType] || reagentType}</h4>
                                    <div class="ml-4 space-y-1">
                                        ${lots.map(lot => `
                                            <p class="text-sm text-gray-600">Lote: ${lot.lote} - Ciclos: ${lot.cycles}</p>
                                        `).join('')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        utils.openModal(title, contentHTML);
    },

    openViewOnlyCalibrationModal: (calibrationId) => {
        const calibration = state.calibrations.find(c => c.id === calibrationId);
        if (!calibration) {
            utils.showToast("Erro: Calibração não encontrada.", true);
            return;
        }

        const title = `Detalhes da Calibração: ${calibration.type}`;
        const contentHTML = `
            <div class="space-y-6">
                <!-- Informações Básicas -->
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h3 class="text-lg font-bold mb-3 text-gray-800">Informações da Calibração</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Tipo</label>
                            <p class="mt-1 text-gray-900">${ASSAY_TYPE_MAP[calibration.type] || calibration.type}</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Responsável</label>
                            <p class="mt-1 text-gray-900">${calibration.category || 'N/A'}</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Data de Início</label>
                            <p class="mt-1 text-gray-900">${utils.formatDate(calibration.startDate)}</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Data de Término</label>
                            <p class="mt-1 text-gray-900">${utils.formatDate(calibration.endDate)}</p>
                        </div>
                    </div>
                </div>

                <div class="flex justify-end pt-4 border-t">
                    <button type="button" class="btn-close-modal bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg">Fechar</button>
                </div>
            </div>
        `;

        utils.openModal(title, contentHTML);
    },

    /**
     * Abre o modal para gerar relatório em PDF.
     */
    openGeneratePdfReportModal: () => {
        const modalContent = document.getElementById('generate-pdf-report-modal-content');
        if (!modalContent) {
            utils.showToast('Conteúdo do modal de relatório não encontrado.', true);
            return;
        }
        
        utils.openModal('Gerar Relatório em PDF', modalContent.innerHTML, () => {
            const form = document.getElementById('form-generate-pdf-report');
            if (form) {
                // Define datas padrão (último mês)
                const today = new Date();
                const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                
                form.startDate.value = lastMonth.toISOString().split('T')[0];
                form.endDate.value = endOfLastMonth.toISOString().split('T')[0];
                
                form.addEventListener('submit', dataHandlers.handleGeneratePdfReport);
                
                // Listener para o botão cancelar
                const cancelBtn = document.getElementById('btn-cancel-pdf-report');
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', () => {
                        utils.closeModal();
                    });
                }
            }
        });
    },

    /**
     * Abre o modal de adicionar ensaio de secadoras.
     */
    openAddDryerAssayModal: () => {
        utils.openModal('Adicionar Ensaio de Secadoras', document.getElementById('add-dryer-assay-modal-content')?.innerHTML, () => {
            const form = document.getElementById('form-add-dryer-assay');
            if (form) {
                renderers.populateTerminalSelects(form);
                form.addEventListener('submit', dataHandlers.handleAddDryerAssay);
            }
        });
    },
    
    /**
     * Abre o modal de exclusão em massa.
     */
    openBulkDeleteModal: () => {
        const modalContent = document.getElementById('bulk-delete-modal-content');
        if (!modalContent) {
            console.error('Modal content not found');
            utils.showToast('Erro ao abrir modal de exclusão em massa.', true);
            return;
        }
        
        // Clona o conteúdo para preservar os elementos
        const contentClone = modalContent.cloneNode(true);
        contentClone.classList.remove('hidden');
        
        utils.openModal('Exclusão em Massa', contentClone.innerHTML, () => {
            const form = document.getElementById('form-bulk-delete');
            if (!form) {
                console.error('Form not found in modal');
                return;
            }
            
            // Event listeners para o modal
            document.getElementById('btn-cancel-bulk-delete')?.addEventListener('click', () => {
                utils.closeModal();
            });
            
            document.getElementById('btn-preview-bulk-delete')?.addEventListener('click', () => {
                modalHandlers.previewBulkDelete();
            });
            
            form.addEventListener('submit', dataHandlers.handleBulkDelete);
        });
    },
    
    /**
     * Visualiza os itens que serão excluídos na exclusão em massa.
     */
    previewBulkDelete: () => {
        const startDate = document.getElementById('bulk-delete-start-date')?.value;
        const endDate = document.getElementById('bulk-delete-end-date')?.value;
        
        if (!startDate || !endDate) {
            utils.showToast('Por favor, selecione as datas de início e fim.', true);
            return;
        }
        
        if (new Date(startDate) > new Date(endDate)) {
            utils.showToast('A data de início não pode ser posterior à data de fim.', true);
            return;
        }
        
        const itemsToDelete = modalHandlers.getItemsInDateRange(startDate, endDate);
        const previewDiv = document.getElementById('bulk-delete-preview');
        const summaryDiv = document.getElementById('bulk-delete-summary');
        
        if (!previewDiv || !summaryDiv) return;
        
        let summaryHtml = '';
        
        if (itemsToDelete.scheduledAssays.length > 0) {
            summaryHtml += `<li><strong>Ensaios do Cronograma:</strong> ${itemsToDelete.scheduledAssays.length} itens</li>`;
        }
        
        if (itemsToDelete.safetyScheduledAssays.length > 0) {
            summaryHtml += `<li><strong>Ensaios de Segurança do Cronograma:</strong> ${itemsToDelete.safetyScheduledAssays.length} itens</li>`;
        }
        
        if (itemsToDelete.historicalAssays.length > 0) {
            summaryHtml += `<li><strong>Ensaios do Histórico:</strong> ${itemsToDelete.historicalAssays.length} itens</li>`;
        }
        
        if (itemsToDelete.holidays.length > 0) {
            summaryHtml += `<li><strong>Férias:</strong> ${itemsToDelete.holidays.length} itens</li>`;
        }
        
        if (itemsToDelete.calibrations.length > 0) {
            summaryHtml += `<li><strong>Calibrações:</strong> ${itemsToDelete.calibrations.length} itens</li>`;
        }
        
        if (summaryHtml === '') {
            summaryHtml = '<li>Nenhum item encontrado no período selecionado.</li>';
        }
        
        summaryDiv.innerHTML = summaryHtml;
        previewDiv.style.display = 'block';
    },
    
    /**
     * Obtém todos os itens que estão no intervalo de datas especificado.
     */
    getItemsInDateRange: (startDate, endDate) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        const isInRange = (itemStartDate) => {
            const itemDate = new Date(itemStartDate);
            return itemDate >= start && itemDate <= end;
        };
        
        return {
            scheduledAssays: state.scheduledAssays.filter(assay => isInRange(assay.startDate)),
            safetyScheduledAssays: state.safetyScheduledAssays.filter(assay => isInRange(assay.startDate)),
            historicalAssays: state.historicalAssays.filter(assay => isInRange(assay.startDate)),
            holidays: state.holidays.filter(holiday => isInRange(holiday.startDate)),
            calibrations: state.calibrations.filter(calibration => isInRange(calibration.startDate))
        };
    },

    /**
     * Abre o modal de visualização específico para ensaios de secadoras.
     * @param {number} assayId - O ID do ensaio de secadora a ser visualizado.
     */
    openViewDryerAssayModal: (assayId) => {
        let assay = state.scheduledAssays.find(a => a.id === assayId);
        if (!assay) {
            assay = state.safetyScheduledAssays.find(a => a.id === assayId);
        }
        if (!assay) {
            utils.showToast("Erro: Ensaio não encontrado.", true);
            return;
        }

        const modalContent = document.getElementById('view-dryer-assay-modal-content');
        if (!modalContent) {
            utils.showToast('Template do modal de visualização de secadoras não encontrado.', true);
            return;
        }

        utils.openModal('Visualizar Ensaio de Secadora', modalContent.innerHTML, () => {
            // Preencher os campos com os dados do ensaio
            document.getElementById('view-dryer-protocol').textContent = assay.protocol || 'N/A';
            document.getElementById('view-dryer-orcamento').textContent = assay.orcamento || 'N/A';
            document.getElementById('view-dryer-manufacturer').textContent = assay.assayManufacturer || 'N/A';
            document.getElementById('view-dryer-model').textContent = assay.model || 'N/A';
            document.getElementById('view-dryer-nominal-load').textContent = assay.nominalLoad ? `${assay.nominalLoad} kg` : 'N/A';
            document.getElementById('view-dryer-humidity').textContent = assay.humidity ? `${assay.humidity}` : 'N/A';
            document.getElementById('view-dryer-tensao').textContent = assay.tensao ? `${assay.tensao}` : 'N/A';
            document.getElementById('view-dryer-period').textContent = `${utils.formatDate(assay.startDate)} - ${utils.formatDate(assay.endDate)}`;
            document.getElementById('view-dryer-terminal').textContent = assay.setup || 'N/A';
            document.getElementById('view-dryer-status').textContent = ASSAY_STATUS_MAP[assay.status] || assay.status || 'N/A';
            // Número do Relatório: mostrar 'Pendente' quando vazio
            document.getElementById('view-dryer-report-number').textContent = assay.report ? assay.report : 'Pendente';
            // Emissão de Relatório: usar data prevista (reportDate) e mostrar 'N/A' quando vazio
            const reportDateVal = assay.reportDate || assay.report_date;
            document.getElementById('view-dryer-report').textContent = reportDateVal ? utils.formatDate(reportDateVal) : 'N/A';
            document.getElementById('view-dryer-observacoes').textContent = assay.observacoes || 'Nenhuma observação';
            
            
            // Configurar botões
            const editBtn = document.querySelector('.btn-edit-dryer-assay');
            const deleteBtn = document.querySelector('.btn-delete-dryer-assay');

            const footer = editBtn.parentElement; 
            const status = assay.status.toLowerCase();

            // Só mostra o botão de relatório se o ensaio estiver concluído ou incompleto
            if (status === 'concluido' || status === 'incompleto' || status === 'relatorio') {
                const reportButton = document.createElement('button');
                reportButton.className = 'btn-add-report-modal bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded-lg flex items-center';
                reportButton.dataset.id = assay.id;
                reportButton.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                    ${assay.report && assay.report !== 'Pendente' ? 'Editar Relatório' : 'Adicionar Relatório'}
                `;
                
                // Adiciona o botão de relatório antes do botão "Editar"
                footer.insertBefore(reportButton, editBtn);
                
                // Reutiliza a função que já existe para os ensaios de eficiência
                reportButton.addEventListener('click', () => {
                    modalHandlers.openReportModalGantt(assay.id);
                });
            }

            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    utils.closeModal();
                    modalHandlers.openEditDryerAssayModal(assay.id);
                });
            }

            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    ui.showConfirmationModal('Tem certeza que deseja excluir este ensaio de secadora?', () => {
                        dataHandlers.handleDeleteGanttItem(assay.id);
                        utils.closeModal();
                    });
                });
            }
         });
     },

    /**
     * Abre o modal de edição específico para ensaios de secadoras.
     * @param {number} assayId - O ID do ensaio de secadora a ser editado.
     */
    openEditDryerAssayModal: (assayId) => {
        let assayToEdit = state.scheduledAssays.find(a => a.id === assayId);
        if (!assayToEdit) {
            assayToEdit = state.safetyScheduledAssays.find(a => a.id === assayId);
        }
        if (!assayToEdit) {
            utils.showToast("Erro: Ensaio não encontrado.", true);
            return;
        }

        state.selectedAssayId = assayId;
        const modalContentTemplate = document.getElementById('edit-dryer-assay-modal-content');
        if (!modalContentTemplate) {
            utils.showToast("Erro: Template do modal de edição de secadora não encontrado.", true);
            return;
        }

        utils.openModal('Editar Ensaio de Secadora', modalContentTemplate.innerHTML, () => {
            const form = document.getElementById('form-edit-dryer-assay');
            if (!form) return;

            // Popular os selects de terminal
            renderers.populateTerminalSelects(form);
            
            // Preencher o formulário com os dados do ensaio
            form.querySelector('[name="protocol"]').value = assayToEdit.protocol || '';
            form.querySelector('[name="orcamento"]').value = assayToEdit.orcamento || '';
            form.querySelector('[name="humidity"]').value = assayToEdit.humidity || '';
            form.querySelector('[name="assayManufacturer"]').value = assayToEdit.assayManufacturer || '';
            form.querySelector('[name="model"]').value = assayToEdit.model || '';
            form.querySelector('[name="nominalLoad"]').value = assayToEdit.nominalLoad || '';
            form.querySelector('[name="tensao"]').value = assayToEdit.tensao || '';
            form.querySelector('[name="setup"]').value = assayToEdit.setup || '';
            form.querySelector('[name="startDate"]').value = assayToEdit.startDate || '';
            form.querySelector('[name="endDate"]').value = assayToEdit.endDate || '';
            form.querySelector('[name="status"]').value = assayToEdit.status || '';
            form.querySelector('[name="observacoes"]').value = assayToEdit.observacoes || '';
            form.querySelector('[name="id"]').value = assayToEdit.id;
            
            // Configurar o botão de submit
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.textContent = 'Salvar Alterações';
                submitButton.classList.remove('bg-blue-600', 'hover:bg-blue-700');
                submitButton.classList.add('bg-green-600', 'hover:bg-green-700');
            }
            
            // Configurar o evento de submit
            form.removeEventListener('submit', dataHandlers.handleAddGanttAssay);
            form.addEventListener('submit', dataHandlers.handleUpdateDryerAssay);
        });
    }
};

/**
 * Funções de arrastar e soltar (drag and drop) para o cronograma.
 */
const dragHandlers = {
    /**
     * Inicia o processo de arrastar uma tarefa.
     * @param {Event} e - O evento de `pointerdown`.
     */
    // Em main.js, substitua esta função inteira:
// Em main.js, SUBSTITUA por esta versão
// Em main.js, SUBSTITUA por esta versão
handleDragStart: (e) => {
    // Ignora cliques que não sejam o botão esquerdo ou em botões internos
if (e.target.closest('.btn-view-details') || e.target.closest('.gantt-task-menu-trigger') || e.button !== 0) return;

    const originalTarget = e.target.closest('.gantt-event');
    if (!originalTarget) return;

    const assayId = parseInt(originalTarget.dataset.assayId, 10);
    const assay = [...state.scheduledAssays, ...state.safetyScheduledAssays].find(a => a.id === assayId);

    // Não permite mover ou redimensionar férias
    if (!assay || assay.type === 'férias') return;

    e.preventDefault();

    // 1. Mede o elemento original
    const targetRect = originalTarget.getBoundingClientRect();
    const clickOffsetX = e.clientX - targetRect.left;
    const handleWidth = 10; // Deve ser o mesmo valor do CSS

    // 2. Define o ESTADO CORRETO (mover vs. redimensionar)
    if (clickOffsetX < handleWidth) {
        state.isResizing = true;
        state.resizeDirection = 'left';
    } else if (clickOffsetX > targetRect.width - handleWidth) {
        state.isResizing = true;
        state.resizeDirection = 'right';
    } else {
        state.isDragging = true;
    }

    // 3. CRIA O "FANTASMA"
    const ghost = originalTarget.cloneNode(true);
    ghost.id = 'gantt-ghost-element';
    Object.assign(ghost.style, {
        left: `${targetRect.left}px`,
        top: `${targetRect.top}px`,
        width: `${targetRect.width}px`,
        height: `${targetRect.height}px`,
    });
    document.body.appendChild(ghost);

    // 4. ATUALIZA O ESTADO (A LINHA COM ERRO FOI REMOVIDA DAQUI)
    state.dragTarget = ghost;
    state.originalDragTarget = originalTarget;
    state.initialAssay = { ...assay };
    state.dragOffset = {
        x: e.clientX - targetRect.left,
        y: e.clientY - targetRect.top
    };
    
    // 5. "Esconde" o elemento original
    originalTarget.classList.add('dragging-source');

    document.body.style.userSelect = 'none';
    document.body.style.cursor = state.isResizing ? 'ew-resize' : 'grabbing'; // Define o cursor correto
},

    handleDrag: (e) => {
    if (!state.dragTarget) return;
    e.preventDefault();

    if (state.isDragging) {
        // Lógica de MOVER (existente)
        const newX = e.clientX - state.dragOffset.x;
        const newY = e.clientY - state.dragOffset.y;
        state.dragTarget.style.left = `${newX}px`;
        state.dragTarget.style.top = `${newY}px`;

    } else if (state.isResizing) {
        const ghostRect = state.dragTarget.getBoundingClientRect();
        
        if (state.resizeDirection === 'right') {
            // Calcula a nova largura baseada na posição do mouse
            const newWidth = e.clientX - ghostRect.left;
            state.dragTarget.style.width = `${Math.max(DRAG_CONFIG.CELL_WIDTH, newWidth)}px`; // Garante largura mínima de 1 dia
        } else if (state.resizeDirection === 'left') {
            // Calcula a nova posição esquerda e a nova largura
            const newLeft = e.clientX - state.dragOffset.x;
            const originalRight = ghostRect.right + window.scrollX;
            const newWidth = originalRight - (newLeft + window.scrollX);
            
            if (newWidth >= DRAG_CONFIG.CELL_WIDTH) {
                state.dragTarget.style.left = `${newLeft}px`;
                state.dragTarget.style.width = `${newWidth}px`;
            }
        }
    }
},

    // Em main.js, SUBSTITUA por esta versão
// Em main.js, SUBSTITUA por esta versão
handleDragEnd: (e) => {
    // 1. Verifica se uma ação de arrastar OU redimensionar está ativa
    if ((!state.isDragging && !state.isResizing) || !state.dragTarget) { // <-- CORREÇÃO AQUI
        dragHandlers.resetDragState();
        return;
    }
    e.preventDefault();

    // 2. Obtém as coordenadas finais do "fantasma"
    const finalRect = state.dragTarget.getBoundingClientRect();
    const containerRect = DOM.ganttGridContainer.getBoundingClientRect();
    const scrollLeft = DOM.ganttGridContainer.parentElement.scrollLeft;

    let assayArray, assayIndex;
    let isSafetyAssay = false; 

    // 3. Encontra o ensaio original que está sendo modificado
    // CORREÇÃO: A lógica original para encontrar o ensaio estava errada.
    let assay = state.scheduledAssays.find(a => a.id === state.initialAssay.id);
    if (assay) {
        assayArray = state.scheduledAssays;
        assayIndex = assayArray.findIndex(a => a.id === state.initialAssay.id);
        isSafetyAssay = false;
    } else {
        assay = state.safetyScheduledAssays.find(a => a.id === state.initialAssay.id);
        if (assay) {
            assayArray = state.safetyScheduledAssays;
            assayIndex = assayArray.findIndex(a => a.id === state.initialAssay.id);
            isSafetyAssay = true;
        }
    }

    if (assayIndex === -1 || !assayArray) { // Verificação mais robusta
        dragHandlers.resetDragState();
        renderers.renderGanttChart();
        return;
    }

    undoManager.saveState();

    // ===============================================
    // SEPARAÇÃO DA LÓGICA: MOVER VS. REDIMENSIONAR
    // ===============================================

    if (state.isDragging) {
        // --- LÓGICA DE MOVER (O CÓDIGO QUE VOCÊ JÁ TINHA) ---
        
        const relativeLeft = (finalRect.left - containerRect.left) + scrollLeft;
        const startDayIndex = Math.round(relativeLeft / DRAG_CONFIG.CELL_WIDTH);
        
        const firstDate = utils.parseDate(new Date(state.ganttStart).toISOString().split('T')[0]);
        const newStartDate = new Date(firstDate);
        newStartDate.setDate(newStartDate.getDate() + startDayIndex);
        
        const originalStart = utils.parseDate(state.initialAssay.startDate);
        const originalEnd = utils.parseDate(state.initialAssay.endDate);
        const durationInMillis = originalEnd.getTime() - originalStart.getTime();
        const newEndDate = new Date(newStartDate.getTime() + durationInMillis);

        let newCategoryName = null;
        const allRows = DOM.ganttGridContainer.querySelectorAll('.gantt-row-container');
        allRows.forEach(row => {
            const rowRect = row.getBoundingClientRect();
            if (finalRect.top + (finalRect.height / 2) >= rowRect.top && finalRect.top + (finalRect.height / 2) < rowRect.bottom) {
                newCategoryName = row.dataset.category;
            }
        });
        
        const updatedAssay = { ...assayArray[assayIndex] };
        updatedAssay.startDate = newStartDate.toISOString().split('T')[0];
        updatedAssay.endDate = newEndDate.toISOString().split('T')[0];

        let newSetup = updatedAssay.setup;
        let newIsSafety = isSafetyAssay;
        let categoryChanged = false;

        if (newCategoryName) {
            const destCategory = state.efficiencyCategories.find(c => c.name === newCategoryName) ||
                                 state.safetyCategories.find(c => c.name === newCategoryName);
            if (destCategory) { 
                newSetup = destCategory.id;
                newIsSafety = state.safetyCategories.some(c => c.id === newSetup);
                if (updatedAssay.status === 'pendente') updatedAssay.status = 'aguardando';
            } else if (newCategoryName === 'Pendentes') {
                newSetup = null; 
                newIsSafety = false;
                updatedAssay.status = 'pendente';
            }
        }
        
        updatedAssay.setup = newSetup;
        categoryChanged = isSafetyAssay !== newIsSafety;

        if (categoryChanged) {
            assayArray.splice(assayIndex, 1);
            if (newIsSafety) {
                state.safetyScheduledAssays.push(updatedAssay);
            } else {
                state.scheduledAssays.push(updatedAssay);
            }
        } else {
            assayArray[assayIndex] = updatedAssay;
        }

    } else if (state.isResizing) {
        // --- LÓGICA DE SALVAR REDIMENSIONAMENTO (ESTAVA FALTANDO) ---
        
        const updatedAssay = { ...assayArray[assayIndex] };
        
        if (state.resizeDirection === 'right') {
            // Arrastando a alça direita: muda a data final
            const newDurationDays = Math.max(1, Math.round(finalRect.width / DRAG_CONFIG.CELL_WIDTH));
            const startDate = utils.parseDate(updatedAssay.startDate);
            const newEndDate = new Date(startDate);
            newEndDate.setDate(newEndDate.getDate() + newDurationDays - 1); // -1 porque o primeiro dia conta
            
            updatedAssay.endDate = newEndDate.toISOString().split('T')[0];

        } else if (state.resizeDirection === 'left') {
            // Arrastando a alça esquerda: muda a data inicial
            const relativeLeft = (finalRect.left - containerRect.left) + scrollLeft;
            const startDayIndex = Math.max(0, Math.round(relativeLeft / DRAG_CONFIG.CELL_WIDTH));
            
            const firstDate = utils.parseDate(new Date(state.ganttStart).toISOString().split('T')[0]);
            const newStartDate = new Date(firstDate);
            newStartDate.setDate(newStartDate.getDate() + startDayIndex);
            
            // Garante que a data de início não ultrapasse a data de fim
            const endDate = utils.parseDate(updatedAssay.endDate);
            if (newStartDate > endDate) {
                updatedAssay.startDate = updatedAssay.endDate; // Define para o mesmo dia
            } else {
                updatedAssay.startDate = newStartDate.toISOString().split('T')[0];
            }
        }
        
        // Salva a atualização no array de estado
        assayArray[assayIndex] = updatedAssay;
    }

    // 4. Finaliza a operação
    state.hasUnsavedChanges = true;
    ui.toggleScheduleActions(true);
    dragHandlers.resetDragState();
    renderers.renderGanttChart();
},

    resetDragState: () => {
        // Remove o fantasma do DOM
        const ghost = document.getElementById('gantt-ghost-element');
        if (ghost) {
            ghost.remove();
        }

        // Limpa a classe do elemento original
        if (state.originalDragTarget) {
            state.originalDragTarget.classList.remove('dragging-source');
        }

        // Reseta o cursor e a seleção de texto
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        
        // Limpa o estado
        state.isDragging = false;
        state.dragTarget = null;
        state.originalDragTarget = null;
        state.initialAssay = null;
        state.dragOffset = { x: 0, y: 0 };
    },

    /**
     * Manipula o clique direito nos elementos do cronograma para duplicação.
     * @param {Event} e - O evento de clique direito.
     */
    handleRightClick: (e) => {
        e.preventDefault(); // Previne o menu de contexto padrão

        const targetElement = e.target.closest('.gantt-event');
        if (!targetElement) return;

        const assayId = parseInt(targetElement.dataset.assayId, 10);
        const assay = [...state.scheduledAssays, ...state.safetyScheduledAssays].find(a => a.id === assayId);

        if (!assay) return;

        // Não permite duplicar férias
        if (assay.type === 'férias') {
            utils.showToast('Não é possível duplicar eventos de férias.', true);
            return;
        }

        dragHandlers.duplicateAssay(assay);
    },

    /**
     * Duplica um ensaio criando uma cópia com dados similares.
     * @param {Object} originalAssay - O ensaio original a ser duplicado.
     */
    duplicateAssay: (originalAssay) => {
        undoManager.saveState();

        // Posiciona o elemento duplicado logo após o original
        const originalEndDate = utils.parseDate(originalAssay.endDate);
        const newStartDate = new Date(originalEndDate);
        newStartDate.setDate(newStartDate.getDate() + 1);

        // Calcula a duração do ensaio original
        const originalStartDate = utils.parseDate(originalAssay.startDate);
        const durationInDays = Math.ceil((originalEndDate - originalStartDate) / (1000 * 60 * 60 * 24));
        
        const newEndDate = new Date(newStartDate);
        newEndDate.setDate(newEndDate.getDate() + durationInDays);

        // Gera um novo ID único
        const allAssays = [...state.scheduledAssays, ...state.safetyScheduledAssays, ...state.historicalAssays];
        const maxId = Math.max(...allAssays.map(a => a.id), 0);
        const newId = maxId + 1;

        // Cria o ensaio duplicado com dados similares
        const duplicatedAssay = {
            ...originalAssay,
            id: newId,
            startDate: newStartDate.toISOString().split('T')[0],
            endDate: newEndDate.toISOString().split('T')[0],
            protocol: `${originalAssay.protocol}_COPIA`,
            status: originalAssay.status, // Mantém o status original
            setup: originalAssay.setup, // Mantém o setup original para ficar na mesma linha
            subRowIndex: originalAssay.subRowIndex + 1 // Posiciona logo após o original
        };

        // Remove campos específicos que não devem ser copiados
        delete duplicatedAssay.lots;
        delete duplicatedAssay.cycles;
        delete duplicatedAssay.reportDate;

        // Determina se é um ensaio de segurança
        const isSafetyAssay = state.safetyCategories.some(cat => cat.id === originalAssay.setup);

        // Adiciona ao array apropriado
        if (isSafetyAssay) {
            state.safetyScheduledAssays.push(duplicatedAssay);
        } else {
            state.scheduledAssays.push(duplicatedAssay);
        }

        // Marca como alterações não salvas
        state.hasUnsavedChanges = true;
        ui.toggleScheduleActions(true);

        // Re-renderiza o cronograma
        renderers.ganttInitialRenderDone = false;
        renderers.renderGanttChart();

        utils.showToast(`Ensaio "${originalAssay.protocol}" duplicado com sucesso!`);
    }
};

/**
 * Funções auxiliares para estilização e visualização.
 */
function getStatusBorderColor(status) {
    const statusLower = status.toLowerCase();
    switch (statusLower) {
        case 'aguardando': return 'border-red-500';
        case 'labelo': return 'border-gray-300';
        case 'andamento': return 'border-gray-600';
        case 'incompleto': return 'border-orange-500';
        case 'concluido': return 'border-green-500';
        case 'relatorio': return 'border-blue-700';
        case 'pendente': return 'border-yellow-500';
        default: return 'border-gray-400';
    }
}
function getStatusBadgeClass(status, assayType = null) {
    // Cor específica para ensaios de secadora
    if (assayType === 'secadora') {
        return 'bg-pink-200 text-pink-800';
    }
    
    const statusLower = status.toLowerCase();
    switch (statusLower) {
        case 'aguardando': return 'bg-red-200 text-red-800';
        case 'labelo': return 'bg-gray-200 text-gray-700';
        case 'andamento': return 'bg-gray-200 text-gray-800';
        case 'incompleto': return 'bg-orange-200 text-orange-800';
        case 'concluido': return 'bg-green-200 text-green-800';
        case 'relatorio': return 'bg-blue-200 text-blue-800';
        case 'pendente': return 'bg-yellow-200 text-yellow-800';
        default: return 'bg-gray-200 text-gray-800';
    }
}
let dashboardInterval;

function getStatusCardBackground(status, assayType = null) {
    // Cor específica para ensaios de secadora
    if (assayType === 'secadora') {
        return 'bg-pink-100';
    }
    
    switch (status.toLowerCase()) {
        case 'aguardando': return 'bg-red-100';
        case 'labelo': return 'bg-gray-100';
        case 'andamento': return 'bg-gray-100';
        case 'incompleto': return 'bg-orange-100';
        case 'concluido': return 'bg-green-100';
        case 'relatorio': return 'bg-blue-100';
        case 'pendente': return 'bg-yellow-100';
        default: return 'bg-gray-100';
    }
}
function getStatusTextColor(status, assayType = null) {
    if (assayType === 'secadora') {
        return 'text-pink-800';
    }
    switch (status.toLowerCase()) {
        case 'aguardando': return 'text-red-800';
        case 'labelo': return 'text-gray-800';
        case 'andamento': return 'text-gray-800';
        case 'incompleto': return 'text-orange-800';
        case 'concluido': return 'text-green-800';
        case 'relatorio': return 'text-blue-800';
        case 'pendente': return 'text-yellow-800';
        default: return 'text-gray-800';
    }
}
/**
 * Inicia a atualização automática do dashboard.
 */
function startDashboardAutoRefresh() {
    // Atualizar a cada hora
    dashboardInterval = setInterval(() => {
        if (document.getElementById('page-dashboard') &&
            !document.getElementById('page-dashboard').classList.contains('hidden')) {
            renderers.renderDashboard();
        }
    }, 3600000); // 1 hora
}

// Função para ajustar o texto conforme o tamanho do container
function adjustTextToContainer() {
    document.querySelectorAll('.gantt-event').forEach(event => {
        const content = event.querySelector('.gantt-event-content');
        if (!content) return;
        
        const protocolText = content.querySelector('.gantt-text:first-child');
        const detailsText = content.querySelector('.gantt-text:last-child');
        
        if (!protocolText || !detailsText) return;
        
        const eventWidth = event.offsetWidth;
        const eventHeight = event.offsetHeight;
        
        // Ajusta o tamanho da fonte baseado na largura do evento
        if (eventWidth < 100) {
            protocolText.style.fontSize = '0.7rem';
            detailsText.style.fontSize = '0.6rem';
            detailsText.style.display = 'none'; // Esconde detalhes se muito estreito
        } else if (eventWidth < 150) {
            protocolText.style.fontSize = '0.8rem';
            detailsText.style.fontSize = '0.65rem';
            detailsText.style.display = 'block';
        } else {
            protocolText.style.fontSize = '0.9rem';
            detailsText.style.fontSize = '0.7rem';
            detailsText.style.display = 'block';
        }
        
        // Ajusta baseado na altura também
        if (eventHeight < 40) {
            protocolText.style.lineHeight = '1.1';
            detailsText.style.display = 'none';
        }
    });
}

// Chame a função após a renderização e no redimensionamento
setTimeout(adjustTextToContainer, 100);
window.addEventListener('resize', () => {
    if (document.getElementById('page-dashboard') &&
        !document.getElementById('page-dashboard').classList.contains('hidden')) {
        const chartContainers = document.querySelectorAll('.chart-container');
        chartContainers.forEach(container => {
            container.style.height = window.innerWidth < 768 ? '250px' : '320px';
        });
        if (state.charts && safeObjectKeys(state.charts || {}).length > 0) {
            setTimeout(() => {
                Object.values(state.charts).forEach(chart => {
                    if (chart) chart.resize();
                });
            }, 300);
        }
    }
});

// -----------------------------------------------------------------------------
// 3. Gerenciamento de Eventos e Inicialização
// -----------------------------------------------------------------------------

/**
 * Funções de layout para o gráfico de Gantt.
 */
const layoutEngine = {
    /**
     * Calcula as sub-linhas para os ensaios sobrepostos na categoria "Pendentes" e segurança.
     * @param {Array} assays - A lista de ensaios.
     * @returns {{positionedAssays: Array, subRowCount: number}} A lista de ensaios com índice de sub-linha e a contagem total de sub-linhas.
     */
    calculateSubRows: (assays) => {
        if (!assays || assays.length === 0) return { positionedAssays: [], subRowCount: 1 };
        const sortedAssays = [...assays].sort((a, b) => utils.parseDate(a.startDate) - utils.parseDate(b.startDate));
        const subRowsEndDates = [];
        sortedAssays.forEach(assay => {
            let placed = false;
            const assayStart = utils.parseDate(assay.startDate);
            for (let i = 0; i < subRowsEndDates.length; i++) {
                if (assayStart > subRowsEndDates[i]) {
                    assay.subRowIndex = i;
                    subRowsEndDates[i] = utils.parseDate(assay.endDate);
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                assay.subRowIndex = subRowsEndDates.length;
                subRowsEndDates.push(utils.parseDate(assay.endDate));
            }
        });
        return {
            positionedAssays: sortedAssays,
            subRowCount: subRowsEndDates.length || 1
        };
    }
};

/**
 * Adiciona event listeners e inicia a aplicação quando o DOM estiver pronto.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Inicializa o sistema de autenticação
    authSystem.init();
    
    // Inicializa sistema de notificações
    notificationSystem.init();
    notificationSystem.startAutoChecks();

    historicalForecastSystem.init();
    
    const stockAlertBanner = document.getElementById('stock-alert-banner');
    const closeAlertButton = document.getElementById('close-alert-button');

    // Adiciona o evento apenas se os elementos existirem
    if (stockAlertBanner && closeAlertButton) {
        closeAlertButton.addEventListener('click', () => {
            stockAlertBanner.classList.add('hidden');
            
            
            document.body.classList.remove('stock-alert-visible');
        });
    }
    // --- LÓGICA DO MENU DE CONTEXTO ---
    
    const contextMenu = document.getElementById('gantt-context-menu');
    const ganttScrollContainer = document.getElementById('gantt-scroll-container');
    // Âncora atual do menu de contexto e controle de listeners
    let activeContextMenuTrigger = null;
    let contextMenuListenersAttached = false;

    // Função para posicionar o menu próximo ao gatilho (seta)
    const updateContextMenuPosition = () => {
        if (!activeContextMenuTrigger || contextMenu.classList.contains('hidden')) return;
        // Se o elemento âncora saiu do DOM (re-render), fecha o menu
        if (!document.body.contains(activeContextMenuTrigger)) {
            contextMenu.classList.add('hidden');
            detachContextMenuListeners();
            return;
        }
        const rect = activeContextMenuTrigger.getBoundingClientRect();

        // Calcula posição preferida (à direita-alinhado e abaixo do gatilho)
        const menuWidth = contextMenu.offsetWidth;
        const menuHeight = contextMenu.offsetHeight;
        let left = rect.left - menuWidth + rect.width;
        let top = rect.bottom + 4;

        // Mantém dentro da viewport horizontalmente
        if (left < 0) left = rect.left; // cai para posicionar à esquerda do gatilho
        if (left + menuWidth > window.innerWidth) left = Math.max(4, window.innerWidth - menuWidth - 4);

        // Se não cabe abaixo, posiciona acima do gatilho
        if (top + menuHeight > window.innerHeight) top = rect.top - menuHeight - 4;
        if (top < 0) top = Math.max(4, rect.bottom + 4); // garante visibilidade mínima

        contextMenu.style.left = `${left}px`;
        contextMenu.style.top = `${top}px`;
    };

    const attachContextMenuListeners = () => {
        if (contextMenuListenersAttached) return;
        contextMenuListenersAttached = true;
        // Reposiciona ao rolar página ou container
        window.addEventListener('scroll', updateContextMenuPosition, { passive: true });
        DOM.ganttGridContainer?.addEventListener('scroll', updateContextMenuPosition, { passive: true });
        // O contêiner com overflow-x para o Gantt é o #gantt-scroll-container
        ganttScrollContainer?.addEventListener('scroll', updateContextMenuPosition, { passive: true });
        // Fallback para ancestrais caso a estrutura mude
        DOM.ganttGridContainer?.parentElement?.addEventListener('scroll', updateContextMenuPosition, { passive: true });
        // Reposiciona ao redimensionar
        window.addEventListener('resize', updateContextMenuPosition, { passive: true });
    };

    const detachContextMenuListeners = () => {
        if (!contextMenuListenersAttached) return;
        contextMenuListenersAttached = false;
        window.removeEventListener('scroll', updateContextMenuPosition);
        DOM.ganttGridContainer?.removeEventListener('scroll', updateContextMenuPosition);
        ganttScrollContainer?.removeEventListener('scroll', updateContextMenuPosition);
        DOM.ganttGridContainer?.parentElement?.removeEventListener('scroll', updateContextMenuPosition);
        window.removeEventListener('resize', updateContextMenuPosition);
        activeContextMenuTrigger = null;
    };
    
    // 1. Ouve cliques no contêiner do Gantt para ABRIR o menu
    DOM.ganttGridContainer.addEventListener('click', (e) => {
    const menuTrigger = e.target.closest('.gantt-task-menu-trigger');
    if (!menuTrigger) return; // Se não clicou no gatilho, sai

    e.preventDefault();
    e.stopPropagation(); 

    const targetElement = e.target.closest('.gantt-event');
    if (!targetElement) return;

    const assayId = parseInt(targetElement.dataset.assayId, 10);
    const isCalibration = targetElement.classList.contains('gantt-calibration-event');
    
    let item;
    if (isCalibration) {
        item = state.calibrations.find(c => c.id === assayId);
    } else {
        item = [...state.scheduledAssays, ...state.safetyScheduledAssays].find(a => a.id === assayId);
    }

    if (!item) return;

    // Armazena os dados no menu
    contextMenu.dataset.itemId = assayId;
    contextMenu.dataset.isCalibration = isCalibration;
    
    // --- NOVA LÓGICA DE EXIBIÇÃO DE BOTÕES ---

    // Referências para os botões dinâmicos e padrão
    const dynamicActions = contextMenu.querySelector('#context-menu-dynamic-actions');
    const defaultActions = contextMenu.querySelector('#context-menu-default-actions');
    
    // Botões dinâmicos
    const btnHere = contextMenu.querySelector('[data-action="here-assay"]');
    const btnStart = contextMenu.querySelector('[data-action="start-assay"]');
    const btnFinish = contextMenu.querySelector('[data-action="finish-assay"]');
    const btnIncomplete = contextMenu.querySelector('[data-action="incomplete-assay"]');
    const btnReport = contextMenu.querySelector('[data-action="add-report"]');
    
    // Botões padrão
    const btnDuplicate = contextMenu.querySelector('[data-action="duplicate"]');
    const btnPending = contextMenu.querySelector('[data-action="send-to-pending"]');
    const btnScheduleEvent = contextMenu.querySelector('[data-action="schedule-event"]');
    const btnScheduleHoliday = contextMenu.querySelector('[data-action="schedule-holiday"]');
    const btnEditEvent = contextMenu.querySelector('[data-action="edit-event"]');
    const btnEditHoliday = contextMenu.querySelector('[data-action="edit-holiday"]');
    const btnEdit = contextMenu.querySelector('[data-action="edit"]');
    const btnLinkToSafety = contextMenu.querySelector('[data-action="link-to-safety"]');
    const btnUnlinkAssay = contextMenu.querySelector('[data-action="unlink-assay"]');

    // 1. Esconde todos os botões dinâmicos por padrão
    [btnHere, btnStart, btnFinish, btnIncomplete, btnReport].forEach(btn => btn.style.display = 'none');

    // 2. Mostra/Esconde seções inteiras
    if (isCalibration || item.type === 'férias') {
        dynamicActions.style.display = 'none';
        btnDuplicate.style.display = 'none';
        btnPending.style.display = 'none';
        // Oculta ações que não se aplicam a elementos do cronograma
        btnScheduleEvent.style.display = 'none';
        btnScheduleHoliday && (btnScheduleHoliday.style.display = 'none');
        btnEditEvent && (btnEditEvent.style.display = 'none');
        btnEditHoliday && (btnEditHoliday.style.display = 'none');
        btnLinkToSafety && (btnLinkToSafety.style.display = 'none');
        btnUnlinkAssay && (btnUnlinkAssay.style.display = 'none');
        // Garante visibilidade apenas de editar e excluir
        if (btnEdit) {
            btnEdit.style.display = 'flex';
        }
    } else {
        dynamicActions.style.display = 'block'; // Mostra o container de ações de status
        
        // 3. Mostra o botão de ação correto baseado no status
        const status = item.status.toLowerCase();
        switch (status) {
            case 'aguardando':
                btnHere.style.display = 'flex';
                break;
            case 'labelo':
                btnStart.style.display = 'flex';
                break;
            case 'andamento':
                btnFinish.style.display = 'flex';
                btnIncomplete.style.display = 'flex';
                break;
            case 'concluido':
            case 'incompleto':
                btnReport.style.display = 'flex';
                break;
            // 'relatorio' ou 'pendente' não mostram botões de ação
        }

        // 4. Mostra/Esconde ações padrão
        if (item.status === 'pendente') {
            btnDuplicate.style.display = 'none';
            btnPending.style.display = 'none';
        } else {
            btnDuplicate.style.display = 'flex';
            btnPending.style.display = 'flex';
        }
        if (btnEdit) {
            btnEdit.style.display = 'flex';
        }
        // Vínculo: mostra "Criar vínculo" só para eficiência não vinculada; mostra "Desvincular" quando há vínculo
        const isSafety = item.type === 'seguranca-eletrica';
        const hasLink = state.assayLinks.some(l => l.from === item.id || l.to === item.id);
        if (btnLinkToSafety) {
            btnLinkToSafety.style.display = (!isCalibration && !isSafety && !hasLink) ? 'flex' : 'none';
        }
        if (btnUnlinkAssay) {
            btnUnlinkAssay.style.display = hasLink ? 'flex' : 'none';
        }
        btnScheduleEvent.style.display = 'none';
        btnScheduleHoliday && (btnScheduleHoliday.style.display = 'none');
        btnEditEvent && (btnEditEvent.style.display = 'none');
        btnEditHoliday && (btnEditHoliday.style.display = 'none');
    }

        // ----- Posiciona e exibe o menu -----
        activeContextMenuTrigger = menuTrigger;
        contextMenu.classList.remove('header-context');
        contextMenu.classList.remove('hidden');
        // Atualiza posição imediatamente e mantém ancorado em scroll/resize
        updateContextMenuPosition();
        attachContextMenuListeners();
    });

    DOM.ganttHeaderContainer.addEventListener('contextmenu', (e) => {
        const dayCell = e.target.closest('[data-date]');
        if (!dayCell) return;
        e.preventDefault();
        contextMenu.dataset.itemId = '';
        contextMenu.dataset.isCalibration = '';
        contextMenu.dataset.date = dayCell.getAttribute('data-date');
        const dynamicActions = contextMenu.querySelector('#context-menu-dynamic-actions');
    const btnDuplicate = contextMenu.querySelector('[data-action="duplicate"]');
    const btnPending = contextMenu.querySelector('[data-action="send-to-pending"]');
    const btnEdit = contextMenu.querySelector('[data-action="edit"]');
    const btnDelete = contextMenu.querySelector('[data-action="delete"]');
    const btnScheduleEvent = contextMenu.querySelector('[data-action="schedule-event"]');
    const btnScheduleHoliday = contextMenu.querySelector('[data-action="schedule-holiday"]');
    const btnEditEvent = contextMenu.querySelector('[data-action="edit-event"]');
    const btnEditHoliday = contextMenu.querySelector('[data-action="edit-holiday"]');
        dynamicActions.style.display = 'none';
        btnDuplicate.style.display = 'none';
        btnPending.style.display = 'none';
        btnEdit.style.display = 'none';
        btnEditEvent.style.display = 'none';
        btnEditHoliday.style.display = 'none';
        btnDelete.style.display = 'none';
        btnScheduleEvent.style.display = 'none';
        btnScheduleHoliday.style.display = 'none';
        // oculta botões de vínculo no cabeçalho
        const btnLinkToSafety = contextMenu.querySelector('[data-action="link-to-safety"]');
        const btnUnlinkAssay = contextMenu.querySelector('[data-action="unlink-assay"]');
        btnLinkToSafety && (btnLinkToSafety.style.display = 'none');
        btnUnlinkAssay && (btnUnlinkAssay.style.display = 'none');

        const hasEvent = !!getEventForDate(contextMenu.dataset.date);
        const hasHoliday = utils.isHoliday(contextMenu.dataset.date);

        if (hasEvent) {
            btnEditEvent.style.display = 'flex';
            btnDelete.style.display = 'flex';
        } else {
            btnScheduleEvent.style.display = 'flex';
        }

        if (hasHoliday) {
            btnEditHoliday.style.display = 'flex';
            btnDelete.style.display = 'flex';
        } else {
            btnScheduleHoliday.style.display = 'flex';
        }
        activeContextMenuTrigger = dayCell;
        contextMenu.classList.remove('hidden');
        contextMenu.classList.add('header-context');
        updateContextMenuPosition();
        attachContextMenuListeners();
    });

    // 2. Ouve cliques NOS ITENS DO MENU para executar ações
    contextMenu.addEventListener('click', (e) => {
    const actionButton = e.target.closest('button');
    if (!actionButton) return;

    const action = actionButton.dataset.action;
    const itemId = parseInt(contextMenu.dataset.itemId, 10);
    const isCalibration = contextMenu.dataset.isCalibration === 'true';
    const headerDate = contextMenu.dataset.date;

    let item;
    let isSafetyAssay = false;
    if (isCalibration) {
        item = state.calibrations.find(c => c.id === itemId);
    } else {
        item = state.scheduledAssays.find(a => a.id === itemId);
        if (!item) {
            item = state.safetyScheduledAssays.find(a => a.id === itemId);
            isSafetyAssay = true;
        }
    }

    if (!item && !headerDate) {
        utils.showToast("Erro: Tarefa não encontrada.", true);
        return;
    }

    // Executa a ação
        switch (action) {
        
        // --- NOVAS AÇÕES DE STATUS ---
        case 'here-assay':
            dataHandlers.handleHereAssay(itemId);
            break;
        case 'start-assay':
            dataHandlers.handleStartAssay(itemId);
            break;
        case 'finish-assay':
            // Abrir relatório apenas para ensaios de segurança; eficiência segue fluxo padrão
            if (isCalibration) {
                // Calibração não deve abrir relatório
                break;
            }
            if (isSafetyAssay || item.type === 'seguranca-eletrica') {
                modalHandlers.openReportModalGantt(itemId);
            } else {
                modalHandlers.openFinishAssayModal(itemId, 'concluido');
            }
            break;
        case 'incomplete-assay':
            modalHandlers.openFinishAssayModal(itemId, 'incompleto');
            break;
        case 'add-report':
            modalHandlers.openReportModalGantt(itemId);
            break;

        // --- AÇÕES PADRÃO (EXISTENTES) ---
        case 'edit':
            if (isCalibration) {
                modalHandlers.openEditCalibrationModal(item.id);
            } else if (item.type === 'férias') {
                modalHandlers.openEditVacationModal(item.id);
            } else if (item.type === 'seguranca-eletrica') {
                modalHandlers.openEditSafetyAssayModal(item.id);
            } else if (item.type === 'secadora') {
                modalHandlers.openEditDryerAssayModal(item.id);
            } else {
                modalHandlers.openEditGanttAssayModal(item.id);
            }
            break;

        case 'duplicate':
            dragHandlers.duplicateAssay(item);
            break;

        case 'send-to-pending':
            undoManager.saveState();
            item.status = 'pendente';
            item.setup = null;
            if (isSafetyAssay) {
                const index = state.safetyScheduledAssays.findIndex(a => a.id === itemId);
                const [movedAssay] = state.safetyScheduledAssays.splice(index, 1);
                state.scheduledAssays.push(movedAssay);
            }
            state.hasUnsavedChanges = true;
            ui.toggleScheduleActions(true);
            renderers.renderGanttChart();
            utils.showToast(`Tarefa '${item.protocol}' movida para Pendentes.`);
            break;

        case 'link-to-safety':
            if (!isCalibration && !isSafetyAssay) {
                modalHandlers.openLinkEfficiencyToSafetyModal(itemId);
            }
            break;

        case 'unlink-assay':
            undoManager.saveState();
            // Remove vínculo do estado e das observações
            const link = state.assayLinks.find(l => l.from === itemId || l.to === itemId);
            if (link) {
                const eff = state.scheduledAssays.find(a => a.id === link.from);
                const saf = state.safetyScheduledAssays.find(a => a.id === link.to);
                if (eff) eff.observacoes = utils.stripLinkTags(eff.observacoes);
                if (saf) saf.observacoes = utils.stripLinkTags(saf.observacoes);
                state.assayLinks = state.assayLinks.filter(l => !(l.from === link.from && l.to === link.to));
                state.hasUnsavedChanges = true;
                ui.toggleScheduleActions(true);
                renderers.renderGanttChart();
                utils.showToast('Vínculo removido. Guarde as alterações para confirmar.');
            }
            break;

        case 'schedule-event':
            if (item) {
                modalHandlers.openAddScheduleEventModal({ startDate: item.startDate, endDate: item.endDate });
            } else if (headerDate) {
                modalHandlers.openAddScheduleEventModal({ startDate: headerDate, endDate: headerDate });
            }
            break;
        case 'schedule-holiday':
            if (headerDate) {
                modalHandlers.openAddHolidayModal({ startDate: headerDate, endDate: headerDate });
            }
            break;
        case 'edit-event':
            if (headerDate) {
                const ev = getEventForDate(headerDate);
                if (ev) modalHandlers.openEditScheduleEventModal(ev.id);
            }
            break;
        case 'edit-holiday':
            if (headerDate) {
                const holiday = state.holidays.find(h => {
                    const d = utils.parseDate(headerDate);
                    return d >= utils.parseDate(h.startDate) && d <= utils.parseDate(h.endDate);
                });
                if (holiday) modalHandlers.openEditHolidayModal(holiday.id);
            }
            break;

        case 'delete':
            if (headerDate) {
                const ev = getEventForDate(headerDate);
                if (ev) {
                    ui.showConfirmationModal(`Excluir evento "${ev.title}" neste dia?`, () => {
                        dataHandlers.deleteScheduleEvent(ev.id);
                    });
                } else if (utils.isHoliday(headerDate)) {
                    const holiday = state.holidays.find(h => {
                        const d = utils.parseDate(headerDate);
                        return d >= utils.parseDate(h.startDate) && d <= utils.parseDate(h.endDate);
                    });
                    if (holiday) {
                        ui.showConfirmationModal(`Excluir feriado "${holiday.name}"?`, () => {
                            dataHandlers.deleteHolidayLocal(holiday.id);
                        });
                    }
                }
            } else {
                const message = `Tem a certeza de que deseja excluir a tarefa "${item.protocol}"?`;
                ui.showConfirmationModal(message, () => {
                    dataHandlers.handleDeleteGanttItem(item.id);
                });
            }
            break;
    }

    // Esconde o menu após a ação
    contextMenu.classList.add('hidden');
    detachContextMenuListeners();
});

    // 3. FECHA o menu ao clicar em qualquer outro lugar
    document.addEventListener('click', (e) => {
        // Se o clique não foi no menu E não foi em um gatilho de menu, esconde-o
        if (!contextMenu.contains(e.target) && !e.target.closest('.gantt-task-menu-trigger')) {
            contextMenu.classList.add('hidden');
            detachContextMenuListeners();
            contextMenu.classList.remove('header-context');
        }
    });

    // Listener para o filtro de ano do Dashboard
    document.getElementById('dashboard-year-filter')?.addEventListener('change', () => {

        const allReagents = safeObjectKeys(REAGENT_COLORS || {});
        // Apenas re-renderiza os gráficos, não o dashboard inteiro
        renderers.renderCharts();
    });

    
    // Inicializa sistema de cache
    cacheSystem.init();
    
    // Registra o plugin do Chart.js para data labels, se disponível.
    if (window.ChartDataLabels) {
        Chart.register(ChartDataLabels);
    }
    DOM.ganttGridContainer?.addEventListener('mousedown', ganttMiddleClickHandler);

    // Eventos de drag and drop para o Gantt (apenas para administrador)
    // Os event listeners serão adicionados após o login se o usuário tiver permissão
    // Listener para mensagens da extensão VS Code
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'loadData':
                try {
                    console.log("Dados recebidos da extensão:", message.data);
                    const data = message.data && typeof message.data === 'object' ? message.data : {};
                    // Captura página corrente antes de atualizar estado
                    const currentVisiblePage = document.querySelector('.page:not(.hidden)')?.id || 'page-dashboard';
                    
                    // Verifica se há informações de usuário para login automático
                      if (message.currentUser) {
                          console.log('🔍 Login automático detectado:', message.currentUser);
                          
                          // Atualiza status de loading
                          if (DOM.loadingStatus) {
                              DOM.loadingStatus.textContent = `Carregando perfil: ${message.currentUser.displayName}`;
                          }
                          
                          // Faz login automático definindo o usuário atual
                          state.currentUser = message.currentUser;
                          state.isLoggedIn = true;
                          
                          // Pequeno delay para mostrar o status
                          setTimeout(() => {
                              // Oculta a tela de loading e mostra a interface principal
                              if (DOM.loadingScreen) DOM.loadingScreen.classList.add('hidden');
                              authSystem.showMainInterface();
                              
                              console.log('✅ Login automático realizado com sucesso');
                          }, 1000);
                      } else {
                          // Se não há usuário, mostra como visualizador
                          if (DOM.loadingStatus) {
                              DOM.loadingStatus.textContent = 'Configurando acesso como visualizador...';
                          }
                          
                          setTimeout(() => {
                              if (DOM.loadingScreen) DOM.loadingScreen.classList.add('hidden');
                              DOM.mainInterface.classList.remove('hidden');
                          }, 1500);
                      }
                    
                    // Log para debug do carregamento do inventário
                    console.log('[INVENTORY] Carregando inventário do banco de dados...');
                    console.log('[INVENTORY] Itens recebidos:', data.inventory?.length || 0);
                    if (data.inventory && data.inventory.length > 0) {
                        console.log('[INVENTORY] Primeiro item:', data.inventory[0]);
                    }
                    
                    state.inventory = data.inventory || [];
                    state.historicalAssays = data.historicalAssays || [];
                    state.scheduledAssays = data.scheduledAssays || [];
                    state.safetyScheduledAssays = data.safetyScheduledAssays || [];
                    state.originalScheduledAssays = JSON.parse(JSON.stringify(data.scheduledAssays || []));
                    state.originalSafetyScheduledAssays = JSON.parse(JSON.stringify(data.safetyScheduledAssays || []));
                    state.originalCalibrations = JSON.parse(JSON.stringify(data.calibrations || []));
                    state.assayLinks = [];
                    const safetyById = new Map((state.safetyScheduledAssays || []).map(a => [Number(a.id), a]));
                    (state.scheduledAssays || []).forEach(eff => {
                        const obs = String(eff.observacoes || '');
                        const m = obs.match(/\[link_safety:(\d+)\]/);
                        if (m) {
                            const sid = Number(m[1]);
                            if (safetyById.has(sid)) {
                                const exists = state.assayLinks.some(l => l.from === eff.id && l.to === sid);
                                if (!exists) state.assayLinks.push({ from: eff.id, to: sid });
                            }
                        }
                    });
                    (state.safetyScheduledAssays || []).forEach(saf => {
                        const obs = String(saf.observacoes || '');
                        const m = obs.match(/\[link_efficiency:(\d+)\]/);
                        if (m) {
                            const eid = Number(m[1]);
                            const exists = state.assayLinks.some(l => l.from === eid && l.to === saf.id);
                            if (!exists) state.assayLinks.push({ from: eid, to: saf.id });
                        }
                    });
                    state.efficiencyCategories = data.efficiencyCategories || state.efficiencyCategories;
                    console.log('🔍 DEBUG - data.safetyCategories recebido:', data.safetyCategories);
                    state.safetyCategories = data.safetyCategories || state.safetyCategories;
                    console.log('🔍 DEBUG - state.safetyCategories após atribuição:', state.safetyCategories);
                    state.originalEfficiencyCategories = JSON.parse(JSON.stringify(state.efficiencyCategories));
                    state.originalSafetyCategories = JSON.parse(JSON.stringify(state.safetyCategories));                    
                    state.holidays = data.holidays || [];
                    state.events = data.events || [];
                    state.originalHolidays = JSON.parse(JSON.stringify(state.holidays));
                    state.originalEvents = JSON.parse(JSON.stringify(state.events));
                    state.calibrations = data.calibrations || [];
                    state.calibrationEquipments = data.calibrationEquipments || []; // Carrega os equipamentos de calibração
                    
                    // Log específico para verificar datas de calibração
                    console.log('[LOAD] Equipamentos de calibração carregados:', 
                        state.calibrationEquipments.map(eq => ({
                            tag: eq.tag,
                            calibrationStatus: eq.calibrationStatus,
                            lastCalibrationDate: eq.lastCalibrationDate,
                            calibrationStartDate: eq.calibrationStartDate
                        }))
                    );
                    
                    // Log específico para equipamentos em calibração
                    const equipmentsInCalibration = state.calibrationEquipments.filter(eq => eq.calibrationStatus === 'em_calibracao');
                    console.log('🔧 [WEBVIEW] Equipamentos em calibração recebidos:', equipmentsInCalibration.length);
                    equipmentsInCalibration.forEach(eq => {
                        console.log(`🔧 [WEBVIEW] Equipamento em calibração: ${eq.id}, status=${eq.calibrationStatus}, startDate=${eq.calibrationStartDate}`);
                    });
                    
                    if (state.calibrationEquipments && state.calibrationEquipments.length > 0) {
                        console.log('📊 Primeiro equipamento:', state.calibrationEquipments[0]);
                    }
                    state.settings = { ...state.settings, ...(data.settings || {}) };
                    state.systemUsers = data.systemUsers || {};
                    const allEvents = [...(data.historicalAssays || []), ...(data.scheduledAssays || []), ...(data.safetyScheduledAssays || []), ...(data.calibrations || [])];
                    if (allEvents.length > 0) {
                        const sortedEvents = [...allEvents].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
                        state.ganttStart = utils.parseDate(sortedEvents[0].startDate);
                        state.ganttEnd = utils.parseDate(sortedEvents[sortedEvents.length - 1].endDate);
                        state.ganttEnd.setDate(state.ganttEnd.getDate() + 7);
                    } else {
                        const today = new Date();
                        state.ganttStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
                        state.ganttEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 21);
                    }
                    state.hasUnsavedChanges = false;
                    ui.toggleScheduleActions(false);
                    renderers.renderAll();
                    // Mantém página corrente se solicitado e se não for restrita para visualizador
                    if (message.preservePage) {
                        const restrictedPages = ['page-inventory', 'page-assays', 'page-calibrations', 'page-settings'];
                        const isViewer = message.readonly || (state.currentUser && state.currentUser.type === 'visualizador');
                        if (isViewer && restrictedPages.includes(currentVisiblePage)) {
                            renderers.switchPage('page-dashboard');
                        } else {
                            renderers.switchPage(currentVisiblePage);
                        }
                    } else {
                        renderers.switchPage('page-dashboard');
                    }
                } catch (error) {
                    console.error("Erro durante o processamento de 'loadData':", error);
                    utils.showToast("Ocorreu um erro ao carregar os dados.", true);
                } finally {
                    utils.hideLoading();
                }
                break;
            case 'forceDataRefresh':
                try {
                    console.log("Recebida atualização forçada do backend:", message.data);
                    const data = message.data && typeof message.data === 'object' ? message.data : {};

                    // Atualiza todo o estado da aplicação com os novos dados
                    state.inventory = data.inventory || [];
                    state.historicalAssays = data.historicalAssays || [];
                    state.scheduledAssays = data.scheduledAssays || [];
                    state.safetyScheduledAssays = data.safetyScheduledAssays || [];
                    state.holidays = data.holidays || [];
                    state.events = data.events || [];
                    state.calibrations = data.calibrations || [];
                    state.calibrationEquipments = data.calibrationEquipments || [];
                    state.settings = { ...state.settings, ...(data.settings || {}) };
                    state.systemUsers = data.systemUsers || {};
                    state.efficiencyCategories = data.efficiencyCategories || state.efficiencyCategories;
                    state.safetyCategories = data.safetyCategories || state.safetyCategories;

                    // Salva o estado original dos agendamentos para permitir o cancelamento
                    state.originalScheduledAssays = JSON.parse(JSON.stringify(data.scheduledAssays || []));
                    state.originalSafetyScheduledAssays = JSON.parse(JSON.stringify(data.safetyScheduledAssays || []));

                    // Redesenha toda a interface
                    renderers.renderAll();

                    // Notifica o usuário de forma sutil, apenas 1x por ação
                    const now = Date.now();
                    const signature = JSON.stringify({
                        invLen: (data.inventory || []).length,
                        histLen: (data.historicalAssays || []).length,
                        schLen: (data.scheduledAssays || []).length,
                        safSchLen: (data.safetyScheduledAssays || []).length,
                        holLen: (data.holidays || []).length,
                        calLen: (data.calibrations || []).length
                    });
                    const withinCooldown = (now - state.lastForceRefreshToastAt) < state.forceRefreshToastCooldownMs;
                    const isDuplicateAction = signature === state.lastForceRefreshSignature;
                    if (!withinCooldown || !isDuplicateAction) {
                        utils.showToast("Os dados foram atualizados automaticamente.", false);
                        state.lastForceRefreshToastAt = now;
                        state.lastForceRefreshSignature = signature;
                    }

                } catch (error) {
                    console.error("Erro durante o processamento de 'forceDataRefresh':", error);
                    utils.showToast("Erro ao sincronizar dados.", true);
                }
                break;
            case "executeDeleteReagent":
                dataHandlers.handleDeleteReagent(message.reagentId);
                break;
            case "executeDeleteAssay":
                const idToDelete = parseInt(message.assayId, 10);
                if (!isNaN(idToDelete)) {
                    dataHandlers.handleDeleteAssay(idToDelete);
                } else {
                    utils.showToast("Erro: ID da tarefa inválido.", true);
                }
                break;
            case "executeDeleteGanttAssay":
                const ganttIdToDelete = parseInt(message.assayId, 10);
                if (!isNaN(ganttIdToDelete)) {
                    dataHandlers.handleDeleteGanttAssay(ganttIdToDelete);
                } else {
                    utils.showToast("Erro: ID da tarefa inválido.", true);
                }
                break;
            case 'pdfReportGenerated':
                utils.hideLoading();
                if (message.success) {
                    utils.showToast(message.message || 'Relatório PDF gerado com sucesso!');
                } else {
                    utils.showToast(message.message || 'Erro ao gerar relatório PDF', true);
                }
                break;
            case 'categoryOperationResult':
                if (message.success) {
                    if (message.operation === 'add') {
                        utils.showToast('Categoria adicionada com sucesso!');
                        // Recarrega os dados para refletir a nova categoria
                        dataHandlers.requestData();
                    } else if (message.operation === 'delete') {
                        utils.showToast('Categoria excluída com sucesso!');
                        // Recarrega os dados para refletir a exclusão
                        dataHandlers.requestData();
                    }
                } else {
                    utils.showToast(message.error || 'Erro na operação da categoria', true);
                }
                break;
                break;
            case 'eventOperationResult':
                if (message.success) {
                    const op = message.operation;
                    if (op === 'add') {
                        utils.showToast('Evento adicionado com sucesso!');
                        if (message.newId && state.lastEventSubmitted) {
                            const ev = { id: message.newId, ...state.lastEventSubmitted };
                            state.events.push(ev);
                            renderers.renderGanttChart();
                            state.lastEventSubmitted = null;
                        }
                    } else if (op === 'update') {
                        utils.showToast('Evento atualizado com sucesso!');
                        if (state.lastEventSubmitted && state.lastEventSubmitted.id) {
                            const idx = state.events.findIndex(e => Number(e.id) === Number(state.lastEventSubmitted.id));
                            if (idx !== -1) {
                                state.events[idx] = { ...state.events[idx], ...state.lastEventSubmitted };
                                renderers.renderGanttChart();
                            }
                            state.lastEventSubmitted = null;
                        }
                    } else if (op === 'delete') {
                        utils.showToast('Evento excluído com sucesso!');
                        renderers.renderGanttChart();
                    }
                } else {
                    utils.showToast(message.error || 'Erro na operação de evento', true);
                }
                break;
            case 'holidayOperationResult':
                if (message.success) {
                    const op = message.operation;
                    if (op === 'delete') {
                        state.originalHolidays = JSON.parse(JSON.stringify(state.holidays));
                        renderers.renderGanttChart();
                        renderers.renderHolidaysList();
                        utils.showToast('Feriado removido com sucesso!');
                    } else if (op === 'update') {
                        state.originalHolidays = JSON.parse(JSON.stringify(state.holidays));
                        renderers.renderGanttChart();
                        renderers.renderHolidaysList();
                        utils.showToast('Feriado atualizado com sucesso!');
                    }
                } else {
                    utils.showToast(message.error || 'Erro na operação de feriado', true);
                }
                break;
        }
    });

    // Botões de ação do cronograma
    DOM.btnSaveSchedule?.addEventListener('click', () => {
        // Com o sistema de hierarquia, não é mais necessário solicitar senha
        dataHandlers.saveScheduleData();
        
        // Limpa as propriedades temporárias após salvar
        state.scheduledAssays.forEach(assay => {
            if (assay.previousStatus) {
                delete assay.previousStatus;
            }
            if (assay.originalData) {
                delete assay.originalData;
            }
        });
        state.safetyScheduledAssays.forEach(assay => {
            if (assay.previousStatus) {
                delete assay.previousStatus;
            }
            if (assay.originalData) {
                delete assay.originalData;
            }
        });
        
        state.originalScheduledAssays = JSON.parse(JSON.stringify(state.scheduledAssays));
        state.originalSafetyScheduledAssays = JSON.parse(JSON.stringify(state.safetyScheduledAssays));
        state.originalHolidays = JSON.parse(JSON.stringify(state.holidays));
        state.originalEvents = JSON.parse(JSON.stringify(state.events));
        state.hasUnsavedChanges = false;
        ui.toggleScheduleActions(false);
        utils.showToast("Alterações guardadas com sucesso!");
    });
    DOM.btnCancelSchedule?.addEventListener('click', () => {
        // Restaura completamente os dados originais dos ensaios modificados
        state.scheduledAssays.forEach(assay => {
            if (assay.originalData) {
                console.log(`[WEBVIEW] Restaurando dados originais do ensaio ${assay.id}:`, assay.originalData);
                assay.status = assay.originalData.status;
                assay.startDate = assay.originalData.startDate;
                assay.endDate = assay.originalData.endDate;
                assay.cycles = assay.originalData.cycles;
                assay.lots = assay.originalData.lots ? JSON.parse(JSON.stringify(assay.originalData.lots)) : null;
                assay.nominalLoad = assay.originalData.nominalLoad;
                
                // Remove todas as flags temporárias
                delete assay.originalData;
                delete assay.pendingHistoryAdd;
                delete assay.previousStatus;
                delete assay.pendingStockDeduction;
            } else if (assay.pendingHistoryAdd && assay.previousStatus) {
                // Fallback para o sistema anterior
                console.log(`[WEBVIEW] Revertendo status do ensaio ${assay.id} de '${assay.status}' para '${assay.previousStatus}'`);
                assay.status = assay.previousStatus;
                delete assay.pendingHistoryAdd;
                delete assay.previousStatus;
                delete assay.pendingStockDeduction;
            }
        });
        
        // Restaura dados originais dos ensaios de segurança também
        state.safetyScheduledAssays.forEach(assay => {
            if (assay.originalData) {
                console.log(`[WEBVIEW] Restaurando dados originais do ensaio de segurança ${assay.id}:`, assay.originalData);
                assay.status = assay.originalData.status;
                assay.startDate = assay.originalData.startDate;
                assay.endDate = assay.originalData.endDate;
                assay.cycles = assay.originalData.cycles;
                assay.lots = assay.originalData.lots ? JSON.parse(JSON.stringify(assay.originalData.lots)) : null;
                assay.nominalLoad = assay.originalData.nominalLoad;
                
                // Remove todas as flags temporárias
                delete assay.originalData;
                delete assay.pendingHistoryAdd;
                delete assay.previousStatus;
                delete assay.pendingStockDeduction;
            } else if (assay.pendingHistoryAdd && assay.previousStatus) {
                // Fallback para o sistema anterior
                console.log(`[WEBVIEW] Revertendo status do ensaio de segurança ${assay.id} de '${assay.status}' para '${assay.previousStatus}'`);
                assay.status = assay.previousStatus;
                delete assay.pendingHistoryAdd;
                delete assay.previousStatus;
                delete assay.pendingStockDeduction;
            }
        });
        
        // Limpa a lista de ensaios pendentes para histórico
        if (state.pendingHistoricalAssays && state.pendingHistoricalAssays.length > 0) {
            console.log('[WEBVIEW] Removendo ensaios pendentes do histórico:', state.pendingHistoricalAssays.length);
            state.pendingHistoricalAssays = [];
        }
        
        state.scheduledAssays = JSON.parse(JSON.stringify(state.originalScheduledAssays));
        state.safetyScheduledAssays = JSON.parse(JSON.stringify(state.originalSafetyScheduledAssays)); // Reverte o estado de segurança
        state.calibrations = JSON.parse(JSON.stringify(state.originalCalibrations)); // Reverte o estado das calibrações
        state.efficiencyCategories = JSON.parse(JSON.stringify(state.originalEfficiencyCategories));
        state.safetyCategories = JSON.parse(JSON.stringify(state.originalSafetyCategories));
        // Reverte feriados e eventos para o estado original
        state.holidays = JSON.parse(JSON.stringify(state.originalHolidays));
        state.events = JSON.parse(JSON.stringify(state.originalEvents));
        state.hasUnsavedChanges = false;
        ui.toggleScheduleActions(false);

        renderers.ganttInitialRenderDone = false;
        
        renderers.renderGanttChart();
        renderers.renderHolidaysList?.();
        utils.showToast("Alterações canceladas.");
    });
    // Lógica do modal de senha
    DOM.passwordSubmitBtn?.addEventListener('click', accessControl.handlePasswordSubmit);
    DOM.passwordCancelBtn?.addEventListener('click', utils.closeModal); // Fechar o modal de senha diretamente
    DOM.passwordInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') accessControl.handlePasswordSubmit();
    });
    

    // Botões de navegação e funcionalidades globais
    DOM.btnSaveSchedulePassword?.addEventListener('click', () => {
        const newPassword = DOM.settingSchedulePasswordInput.value;
        if (newPassword && newPassword.length >= 4) {
            state.settings.schedulePassword = newPassword;
            dataHandlers.updateSystemSettings({ schedulePassword: newPassword });
            utils.showToast("Senha do cronograma atualizada com sucesso!");
            DOM.settingSchedulePasswordInput.value = '';
        } else {
            utils.showToast("A senha deve ter pelo menos 4 caracteres.", true);
        }
    });
    
    document.getElementById('btn-open-add-vacation-modal')?.addEventListener('click', () => {
        utils.openModal('Agendar Férias', document.getElementById('add-vacation-modal-content')?.innerHTML, () => {
            document.getElementById('form-add-vacation')?.addEventListener('submit', dataHandlers.handleAddVacation);
        });
    });
    document.getElementById('form-add-holiday')?.addEventListener('submit', dataHandlers.handleAddHoliday);
    document.getElementById('holidays-list')?.addEventListener('click', (e) => {
        const removeButton = e.target.closest('.btn-remove-holiday');
        const editButton = e.target.closest('.btn-edit-holiday');
        if (removeButton) {
            dataHandlers.handleRemoveHoliday(parseInt(removeButton.dataset.id, 10));
        } else if (editButton) {
            modalHandlers.openEditHolidayModal(parseInt(editButton.dataset.id, 10));
        }
    });
    
    // Event listeners para gerenciamento de usuários do sistema
    document.getElementById('form-add-system-user')?.addEventListener('submit', dataHandlers.handleAddSystemUser);
    document.getElementById('system-users-list')?.addEventListener('click', (e) => {
        const removeButton = e.target.closest('.btn-remove-system-user');
        const editButton = e.target.closest('.btn-edit-system-user');
        if (removeButton) {
            dataHandlers.handleRemoveSystemUser(removeButton.dataset.username);
        } else if (editButton) {
            modalHandlers.openEditSystemUserModal(editButton.dataset.username);
        }
    });
    document.getElementById('filter-inventory')?.addEventListener('input', renderers.renderInventoryTable);
    document.getElementById('btn-save-threshold')?.addEventListener('click', () => {
        const thresholdInput = document.getElementById('setting-threshold');
        if (thresholdInput) {
            state.settings.alertThreshold = parseInt(thresholdInput.value, 10);
            dataHandlers.saveSettings();
            renderers.checkStockLevel();
            utils.showToast("Limite de alerta salvo com sucesso!");
        }
    });
    document.querySelectorAll('.btn-manual-refresh').forEach(button => {
    button.addEventListener('click', () => {
        utils.showToast('Sincronizando com a rede...', false);
            window.vscode?.postMessage({ command: 'requestManualRefresh' });
    });
});
    
    document.getElementById('btn-save-calibration-threshold')?.addEventListener('click', () => {
        const calibrationThresholdInput = document.getElementById('setting-calibration-threshold');
        if (calibrationThresholdInput) {
            const days = parseInt(calibrationThresholdInput.value, 10);
            if (days >= 1 && days <= 365) {
                state.settings.calibrationAlertDays = days;
                dataHandlers.saveSettings();
                utils.showToast("Configuração de alerta de calibração salva com sucesso!");
            } else {
                utils.showToast("Por favor, insira um valor entre 1 e 365 dias.", true);
            }
        }
    });
    document.getElementById('form-add-email')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target;
        const newEmailInput = form.querySelector('[name="newEmail"]');
        const newEmail = newEmailInput ? newEmailInput.value.trim() : '';
        if (newEmail) {
            let emails = state.settings.notificationEmail ?
                state.settings.notificationEmail.split(',').filter(em => em) : [];
            if (!emails.includes(newEmail)) {
                emails.push(newEmail);
                state.settings.notificationEmail = emails.join(',');
                dataHandlers.saveSettings();
                renderers.populateSettingsForm();
                utils.showToast("E-mail cadastrado com sucesso!");
            } else {
                utils.showToast("Este e-mail já está cadastrado.", true);
            }
            if (newEmailInput) newEmailInput.value = '';
        }
    });
    document.getElementById('email-list')?.addEventListener('click', (e) => {
        const removeButton = e.target.closest('.btn-remove-email');
        const editButton = e.target.closest('.btn-edit-email');
        if (removeButton) {
            const emailToRemove = removeButton.dataset.email;
            const message = `Tem a certeza de que deseja remover o e-mail "${emailToRemove}"?`;
            ui.showConfirmationModal(message, () => dataHandlers.handleRemoveEmail(emailToRemove));
        } else if (editButton) {
            const emailToEdit = editButton.dataset.email;
            modalHandlers.openEditEmailModal(emailToEdit);
        }
    });
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = `page-${e.currentTarget.id.split('-')[1]}`;
            if (pageId === 'page-settings') {
                if (!state.isSettingsUnlocked) {
                    accessControl.openPasswordModal('accessSettings');
                } else {
                    renderers.switchPage(pageId);
                }
            } else {
                renderers.switchPage(pageId);
            }
        });
    });
    // Eventos do modal global
    if (DOM.modal) {
        DOM.modal.querySelector('.modal-close-btn')?.addEventListener('click', utils.closeModal);
        DOM.modal.addEventListener('click', (e) => {
            // Só fecha o modal se o clique for diretamente no backdrop (não em elementos filhos)
            if (e.target === DOM.modal) {
                utils.closeModal();
            }
        });
    }
    // Botões de abrir modais
    document.getElementById('btn-open-reagent-modal')?.addEventListener('click', () => {
        utils.openModal('Adicionar Novo Insumo', document.getElementById('add-reagent-modal-content')?.innerHTML, () => {
            document.getElementById('form-add-reagent')?.addEventListener('submit', dataHandlers.handleAddReagent);
        });
    });
    document.getElementById('btn-open-add-gantt-assay-modal')?.addEventListener('click', () => {
        utils.openModal('Adicionar Ensaio ao Cronograma', document.getElementById('add-gantt-assay-modal-content')?.innerHTML, () => {
            document.getElementById('form-add-gantt-assay')?.addEventListener('submit', dataHandlers.handleAddGanttAssay);
        });
    });
    document.getElementById('btn-open-add-calibration-modal')?.addEventListener('click', () => {
        utils.openModal('Agendar Calibração', document.getElementById('add-calibration-modal-content')?.innerHTML, () => {
            const form = document.getElementById('form-add-calibration');
            const typeSelect = form.querySelector('[name="calibrationType"]');
            const terminalsField = form.querySelector('#affected-terminals-field');
            if(typeSelect) {
                typeSelect.addEventListener('change', (e) => {
                    if (e.target.value === 'calibracao-energia') {
                        terminalsField.classList.remove('hidden');
                    } else {
                        terminalsField.classList.add('hidden');
                    }
                });
            }
            form?.addEventListener('submit', dataHandlers.handleAddCalibration);
        });
    });
    // Event listener movido para o final do arquivo com outros listeners
    document.getElementById('btn-add-efficiency-row').addEventListener('click', () => {
        const newName = prompt("Digite o nome para a nova linha de eficiência:", `Novo Terminal ${state.efficiencyCategories.length + 1}`);
        if (newName && newName.trim() !== "") {
            undoManager.saveState(); // Salva o estado antes de adicionar
            state.efficiencyCategories.push({
                id: Date.now(), // ID único
                name: newName.trim()
            });
            dataHandlers.saveData();
            renderers.renderGanttChart();
            utils.showToast("Nova linha de eficiência adicionada.");
        }
    });

    // ---> NOVO: Listener para adicionar linha de segurança <---
    document.getElementById('btn-add-security-row').addEventListener('click', () => {
        const newName = prompt("Digite o nome para a nova linha de segurança (responsável):", "Novo Responsável");
        if (newName && newName.trim() !== "") {
            undoManager.saveState(); // Salva o estado antes de adicionar
            // Gera um ID único para a nova linha de segurança
            const newId = 'S' + Date.now(); 
            state.safetyCategories.push({
                id: newId,
                name: newName.trim()
            });
            dataHandlers.saveData();
            renderers.renderGanttChart();
            utils.showToast("Nova linha de segurança adicionada.");
        }
    });

    
    document.getElementById('btn-open-add-safety-assay-modal')?.addEventListener('click', () => {
    modalHandlers.openAddSafetyAssayModal();
});
    
    // Filtros de tabela
    const dashboardFilters = ['filter-protocol-dashboard', 'filter-model-dashboard',
    'filter-manufacturer-dashboard', 'filter-start-date-dashboard',
    'filter-end-date-dashboard', 'filter-orcamento-dashboard' // <-- ADICIONADO AQUI
];
const assaysFilters = ['filter-protocol-assays', 'filter-model-assays',
    'filter-manufacturer-assays', 'filter-start-date-assays',
    'filter-end-date-assays', 'filter-orcamento-assays' // <-- ADICIONADO AQUI
];
dashboardFilters.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
        const eventType = element.tagName === 'SELECT' || element.type === 'date' ? 'change' : 'input';
        element.addEventListener(eventType, () => renderers.renderAssaysTables('dashboard'));
    }
});
assaysFilters.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
        const eventType = element.tagName === 'SELECT' || element.type === 'date' ? 'change' : 'input';
        element.addEventListener(eventType, () => renderers.renderAssaysTables('assays'));
    }
});
    // Delegação de eventos para botões dinâmicos
    document.body.addEventListener('click', (e) => {
    // Ignora cliques durante drag and drop
    if (state.isDragging) {
        return;
    }
    
    // Detectando clique no body
    const button = e.target.closest('button');

    if (!button) {
        return;
    }
    
    // Verifica se o clique foi dentro de um modal - se sim, não processa aqui
    const modal = e.target.closest('#modal-template');
    if (modal && (modal.classList.contains('visible') || !modal.classList.contains('hidden'))) {
        return;
    }
    
    console.log('Botão HTML clicado:', button); // Pista 2

    // --- Lógica de Exclusão ---

    if (button.classList.contains('btn-delete-reagent')) {
        console.log('Ação: Excluir Insumo');
        const reagentId = parseInt(button.dataset.id, 10);
        console.log('ID a procurar:', reagentId);
        const reagent = state.inventory.find(r => r.id === reagentId);
        console.log('Item encontrado no state.inventory:', reagent); // Pista Chave!
        if (reagent) {
            const message = `Tem a certeza de que deseja excluir o insumo "${reagent.reagent} - Lote ${reagent.lot}"?`;
            ui.showConfirmationModal(message, () => dataHandlers.handleDeleteReagent(reagentId));
        } else {
            console.error('Falha silenciosa: Insumo não encontrado no estado da aplicação.');
        }

    } else if (button.classList.contains('btn-delete-assay')) {
        console.log('Ação: Excluir Ensaio Histórico');
        const assayId = parseInt(button.dataset.id, 10);
        console.log('ID a procurar:', assayId);
        const assay = state.historicalAssays.find(a => a.id === assayId);
        console.log('Item encontrado no state.historicalAssays:', assay); // Pista Chave!
        if (assay) {
            const message = `Tem a certeza de que deseja excluir o ensaio histórico "${assay.protocol}"?`;
            ui.showConfirmationModal(message, () => dataHandlers.handleDeleteAssay(assayId));
        } else {
            console.error('Falha silenciosa: Ensaio não encontrado no estado da aplicação.');
        }

    } else if (button.classList.contains('btn-delete-gantt-assay')) {
        // Verifica se está dentro de um modal - se sim, não processa aqui
        const modalContext = button.closest('#modal-template');
        if (modalContext && (modalContext.classList.contains('visible') || !modalContext.classList.contains('hidden'))) {
            console.log('Botão delete-gantt-assay dentro do modal - ignorando listener global');
            return;
        }
        console.log('Ação: Excluir Tarefa do Cronograma');
        const assayId = parseInt(button.dataset.id, 10);
        console.log('ID a procurar:', assayId);
        const allAssays = [...state.scheduledAssays, ...state.safetyScheduledAssays];
        const assay = allAssays.find(a => a.id === assayId);
        console.log('Item encontrado em scheduledAssays/safetyScheduledAssays:', assay); // Pista Chave!
        if (assay) {
            const message = `Tem a certeza de que deseja excluir o ensaio "${assay.protocol}" do cronograma?`;
            ui.showConfirmationModal(message, () => dataHandlers.handleDeleteGanttItem(assayId));
        } else {
            console.error('Falha silenciosa: Tarefa não encontrada no estado da aplicação.');
        }

    } else if (button.classList.contains('btn-delete-gantt-calibration')) {
        // Verifica se está dentro de um modal - se sim, não processa aqui
        const modalContext = button.closest('#modal-template');
        if (modalContext && (modalContext.classList.contains('visible') || !modalContext.classList.contains('hidden'))) {
            console.log('Botão delete-gantt-calibration dentro do modal - ignorando listener global');
            return;
        }
        console.log('Ação: Excluir Calibração do Cronograma');
        const calibId = parseInt(button.dataset.id, 10);
        console.log('ID a procurar:', calibId);
        const calib = state.calibrations.find(c => c.id === calibId);
        console.log('Item encontrado em state.calibrations:', calib); // Pista Chave!
        if (calib) {
            const message = `Tem a certeza de que deseja excluir a calibração "${calib.protocol}"?`;
            ui.showConfirmationModal(message, () => dataHandlers.handleDeleteGanttItem(calibId));
        } else {
            console.error('Falha silenciosa: Calibração não encontrada no estado da aplicação.');
        }
    
    } else if (button.classList.contains('btn-delete-row')) {
        const categoryId = button.dataset.categoryId;
        const categoryName = button.dataset.categoryName;
        dataHandlers.handleDeleteRow(categoryId, categoryName);
    } else if (button.classList.contains('btn-remove-holiday')) {
        const holidayId = parseInt(button.dataset.id, 10);
        const holiday = state.holidays.find(h => h.id === holidayId);
        if (holiday) {
             const message = `Tem a certeza de que deseja remover o feriado "${holiday.name}"?`;
             ui.showConfirmationModal(message, () => dataHandlers.handleRemoveHoliday(holidayId));
        }
    } else if (button.classList.contains('btn-remove-email')) {
        const email = button.dataset.email;
        const message = `Tem a certeza de que deseja remover o e-mail "${email}"?`;
        ui.showConfirmationModal(message, () => dataHandlers.handleRemoveEmail(email));
    }

    // --- Outros Botões ---

    else if (button.classList.contains('btn-view-details')) {
        const isCalibration = button.dataset.isCalibration === 'true';
        const itemId = parseInt(button.dataset.assayId, 10);
        const isDashboard = button.closest('.dashboard-card') !== null;
        if (isNaN(itemId)) return utils.showToast("Erro: ID inválido.", true);

        // No dashboard, manter modal somente visualização
        if (isDashboard) {
            if (isCalibration) modalHandlers.openViewOnlyCalibrationModal(itemId);
            else modalHandlers.openViewOnlyAssayModal(itemId);
            return;
        }

        // Visualizadores devem ver o modal completo no cronograma
        if (state.currentUser && state.currentUser.type === 'visualizador') {
            if (isCalibration) modalHandlers.openViewGanttCalibrationModal(itemId);
            else modalHandlers.openViewGanttAssayModal(itemId);
            return;
        }

        // Usuários em modo somente visualização (não visualizadores) continuam com modal de visualização
        if (state.currentUser && state.currentUser.permissions && state.currentUser.permissions.viewOnly) {
            if (isCalibration) modalHandlers.openViewOnlyCalibrationModal(itemId);
            else modalHandlers.openViewOnlyAssayModal(itemId);
            return;
        }

        // Caso padrão: modal completo com botões de ação
        if (isCalibration) modalHandlers.openViewGanttCalibrationModal(itemId);
        else modalHandlers.openViewGanttAssayModal(itemId);
    } else if (button.classList.contains('btn-edit-reagent')) {
        modalHandlers.openEditReagentModal(parseInt(button.dataset.id, 10));
    } else if (button.classList.contains('btn-edit-gantt-assay')) {
        // Verifica se está dentro de um modal - se sim, não processa aqui
        const modalContext = button.closest('#modal-template');
        if (modalContext && (modalContext.classList.contains('visible') || !modalContext.classList.contains('hidden'))) {
            console.log('Botão edit-gantt-assay dentro do modal - ignorando listener global');
            return;
        }
        modalHandlers.openEditGanttAssayModal(parseInt(button.dataset.id, 10));
    } else if (button.classList.contains('btn-open-report-modal') || button.classList.contains('btn-edit-report')) {
        modalHandlers.openReportModalGantt(parseInt(button.dataset.id, 10));
    } else if (button.classList.contains('btn-edit-assay')) {
        modalHandlers.openEditAssayModal(parseInt(button.dataset.id));
    } else if (button.classList.contains('btn-start-assay')) {
        dataHandlers.handleStartAssay(parseInt(button.dataset.id));
    } else if (button.classList.contains('btn-here-assay')) {
        dataHandlers.handleHereAssay(parseInt(button.dataset.id));
    } else if (button.classList.contains('btn-finish-assay')) {
        modalHandlers.openFinishAssayModal(parseInt(button.dataset.id), button.dataset.status);
    } else if (button.classList.contains('btn-remove-lote') || button.closest('.btn-remove-lote')) {
        const removeButton = button.classList.contains('btn-remove-lote') ? button : button.closest('.btn-remove-lote');
        removeButton.closest('.lote-entry')?.remove();
    } else if (button.classList.contains('btn-close-modal')) {
        utils.closeModal();
    }
});

    // --- LISTENERS ESPECÍFICOS DE SETUP (FORA DA DELEGAÇÃO) ---
    
    // Listener para mensagens da extensão VS Code
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'loadData':
                try {
                    console.log("Dados recebidos da extensão:", message.data);
                    const data = message.data && typeof message.data === 'object' ? message.data : {};
                    const currentVisiblePage = document.querySelector('.page:not(.hidden)')?.id || 'page-dashboard';
                    state.inventory = data.inventory || [];
                    state.historicalAssays = data.historicalAssays || [];
                    state.scheduledAssays = data.scheduledAssays || [];
                    state.safetyScheduledAssays = data.safetyScheduledAssays || [];
                    state.originalScheduledAssays = JSON.parse(JSON.stringify(data.scheduledAssays || []));
                    state.originalSafetyScheduledAssays = JSON.parse(JSON.stringify(data.safetyScheduledAssays || []));
                    state.holidays = data.holidays || [];
                    state.calibrations = data.calibrations || [];
                    state.calibrationEquipments = data.calibrationEquipments || []; // Carrega os equipamentos de calibração
                    state.settings = { ...state.settings, ...(data.settings || {}) };
                    if(data.efficiencyCategories) state.efficiencyCategories = data.efficiencyCategories;
                    if(data.safetyCategories) state.safetyCategories = data.safetyCategories;
                    renderers.renderAll();
                    // Mantém página corrente se solicitado e se não for restrita para visualizador
                    if (message.preservePage) {
                        const restrictedPages = ['page-inventory', 'page-assays', 'page-calibrations', 'page-settings'];
                        const isViewer = message.readonly || (state.currentUser && state.currentUser.type === 'visualizador');
                        if (isViewer && restrictedPages.includes(currentVisiblePage)) {
                            renderers.switchPage('page-dashboard');
                        } else {
                            renderers.switchPage(currentVisiblePage);
                        }
                    } else {
                        renderers.switchPage('page-dashboard');
                    }
                } catch (error) {
                    console.error("Erro durante o processamento de 'loadData':", error);
                    utils.showToast("Ocorreu um erro ao carregar os dados.", true);
                } finally {
                    utils.hideLoading();
                }
                break;
                
            case 'saveSystemUsersResult':
                if (message.success) {
                    utils.showToast(message.message || 'Usuários salvos com sucesso!');
                } else {
                    utils.showToast(message.error || 'Erro ao salvar usuários.', true);
                }
                break;
                
            case 'bulkDeleteResult':
                if (message.success) {
                    utils.showToast(message.message || 'Exclusão em massa concluída com sucesso!');
                    // Recarrega os dados para refletir as mudanças
            window.vscode?.postMessage({ command: 'webviewReady' });
                } else {
                    utils.showToast(message.error || 'Erro ao realizar exclusão em massa.', true);
                }
                break;

            // ==================== HANDLERS PARA OPERAÇÕES GRANULARES ====================

            case 'inventoryGranularOperationResult':
                if (message.success) {
                    const operationMessages = {
                        'create': 'Item de inventário criado com sucesso!',
                        'update': 'Item de inventário atualizado com sucesso!',
                        'updateQuantity': 'Quantidade do inventário atualizada com sucesso!',
                        'delete': 'Item de inventário removido com sucesso!'
                    };
                    utils.showToast(operationMessages[message.operation] || 'Operação realizada com sucesso!');
                    
                    // Recarrega os dados para refletir as mudanças
            window.vscode?.postMessage({ command: 'webviewReady' });
                } else {
                    utils.showToast(message.error || 'Erro na operação de inventário.', true);
                }
                break;

            case 'inventoryGranularDataResult':
                if (message.success) {
                    console.log('[WEBVIEW] Dados de inventário recebidos:', message.operation, message.data);
                    
                    // Processa os dados conforme a operação
                    switch (message.operation) {
                        case 'getById':
                            // Pode ser usado para preencher formulários de edição
                            console.log('[WEBVIEW] Item específico:', message.data);
                            break;
                        case 'getAll':
                            // Atualiza o estado do inventário
                            state.inventory = message.data || [];
                            renderers.renderInventory();
                            break;
                        case 'getLowStock':
                            // Pode ser usado para alertas ou dashboards
                            console.log('[WEBVIEW] Itens com estoque baixo:', message.data);
                            break;
                    }
                } else {
                    utils.showToast(message.error || 'Erro ao buscar dados de inventário.', true);
                }
                break;

            case 'scheduledAssayOperationResult':
                if (message.success) {
                    const operationMessages = {
                        'create': 'Ensaio agendado criado com sucesso!',
                        'update': 'Ensaio agendado atualizado com sucesso!',
                        'delete': 'Ensaio agendado removido com sucesso!'
                    };
                    utils.showToast(operationMessages[message.operation] || 'Operação realizada com sucesso!');
                } else {
                    utils.showToast(message.error || 'Erro na operação de ensaio agendado.', true);
                }
                break;

            case 'safetyScheduledAssayOperationResult':
                if (message.success) {
                    const operationMessages = {
                        'create': 'Ensaio de segurança agendado criado com sucesso!',
                        'update': 'Ensaio de segurança agendado atualizado com sucesso!',
                        'delete': 'Ensaio de segurança agendado removido com sucesso!'
                    };
                    utils.showToast(operationMessages[message.operation] || 'Operação realizada com sucesso!');
                } else {
                    utils.showToast(message.error || 'Erro na operação de ensaio de segurança agendado.', true);
                }
                break;

            case 'scheduledAssayDataResult':
                if (message.success) {
                    console.log('[WEBVIEW] Dados de ensaios agendados recebidos:', message.operation, message.data);
                    
                    // Processa os dados conforme a operação
                    switch (message.operation) {
                        case 'getById':
                            // Pode ser usado para preencher formulários de edição
                            console.log('[WEBVIEW] Ensaio específico:', message.data);
                            break;
                        case 'getAll':
                            // Atualiza o estado dos ensaios agendados
                            state.scheduledAssays = message.data || [];
                            renderers.renderGantt();
                            break;
                    }
                } else {
                    utils.showToast(message.error || 'Erro ao buscar dados de ensaios agendados.', true);
                }
                break;

            case 'calibrationOperationResult':
                if (message.success) {
                    const operationMessages = {
                        'create': 'Calibração criada com sucesso!',
                        'update': 'Calibração atualizada com sucesso!',
                        'delete': 'Calibração removida com sucesso!'
                    };
                    utils.showToast(operationMessages[message.operation] || 'Operação realizada com sucesso!');
                    
                    // Recarrega os dados para refletir as mudanças
            window.vscode?.postMessage({ command: 'webviewReady' });
                } else {
                    utils.showToast(message.error || 'Erro na operação de calibração.', true);
                }
                break;

            case 'calibrationDataResult':
                if (message.success) {
                    console.log('[WEBVIEW] Dados de calibrações recebidos:', message.operation, message.data);
                    
                    // Processa os dados conforme a operação
                    switch (message.operation) {
                        case 'getById':
                            // Pode ser usado para preencher formulários de edição
                            console.log('[WEBVIEW] Calibração específica:', message.data);
                            break;
                        case 'getAll':
                            // Atualiza o estado das calibrações
                            state.calibrations = message.data || [];
                            renderers.renderCalibrations();
                            break;
                        case 'getUpcoming':
                            // Pode ser usado para alertas ou dashboards
                            console.log('[WEBVIEW] Calibrações próximas:', message.data);
                            break;
                    }
                } else {
                    utils.showToast(message.error || 'Erro ao buscar dados de calibrações.', true);
                }
                break;

            case 'deleteCalibrationEquipmentResult':
                if (message.success) {
                    utils.showToast('Equipamento removido com sucesso!');
                    // Recarrega apenas os dados de calibração sem mudar de página
                    window.vscode?.postMessage({ command: 'getAllCalibrations' });
                } else {
                    utils.showToast(message.error || 'Erro ao remover equipamento.', true);
                }
                break;
            
        }
    });

    // Event listeners duplicados removidos - já existem nas linhas 9125-9146

    // Modal de Senha
    DOM.passwordSubmitBtn?.addEventListener('click', accessControl.handlePasswordSubmit);
    DOM.passwordCancelBtn?.addEventListener('click', accessControl.closePasswordModal);
    DOM.passwordInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') accessControl.handlePasswordSubmit();
    });

    // Navegação e botões principais
    document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', (e) => {
        e.preventDefault();
        const pageId = `page-${e.currentTarget.id.split('-')[1]}`;
        if (pageId === 'page-settings') {
            if (!state.isSettingsUnlocked) accessControl.openPasswordModal('accessSettings');
            else renderers.switchPage(pageId);
        } else {
            renderers.switchPage(pageId);
        }
    }));
    // Listeners para abrir modais
    document.getElementById('btn-open-add-gantt-assay-modal')?.addEventListener('click', () => modalHandlers.openAddGanttAssayModal());
    document.getElementById('btn-open-add-dryer-assay-modal')?.addEventListener('click', () => modalHandlers.openAddDryerAssayModal());
    document.getElementById('btn-open-add-safety-assay-modal')?.addEventListener('click', () => modalHandlers.openAddSafetyAssayModal());
    document.getElementById('btn-open-add-calibration-modal')?.addEventListener('click', () => modalHandlers.openAddCalibrationModal());
    document.getElementById('btn-open-add-vacation-modal')?.addEventListener('click', () => modalHandlers.openAddVacationModal());
    document.getElementById('btn-open-add-schedule-event-modal')?.addEventListener('click', () => modalHandlers.openAddScheduleEventModal());
    // Listener removido - já existe na linha 7447
    document.getElementById('btn-open-assay-modal')?.addEventListener('click', () => modalHandlers.openAddAssayModal());
    document.getElementById('btn-generate-pdf-report')?.addEventListener('click', () => modalHandlers.openGeneratePdfReportModal());
    
    // Listener para exclusão em massa no menu principal (apenas administradores)
    document.getElementById('nav-bulk-delete')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!state.currentUser || state.currentUser.type !== 'administrador') {
            utils.showToast('Apenas administradores podem realizar exclusão em massa.', true);
            return;
        }
        modalHandlers.openBulkDeleteModal();
    });

    // Listener para adicionar linha de eficiência
    document.getElementById('btn-add-efficiency-row')?.addEventListener('click', () => {
    const modalContent = document.getElementById('add-row-modal-content').innerHTML;
    utils.openModal('Adicionar Linha de Eficiência', modalContent, () => {
        const form = document.getElementById('form-add-row');
        if (!form) return;
        
        form.rowType.value = 'efficiency'; // Define o tipo de linha
        form.addEventListener('submit', dataHandlers.handleAddRow);
    });
});

// Listener para adicionar linha de segurança
document.getElementById('btn-add-security-row')?.addEventListener('click', () => {
    const modalContent = document.getElementById('add-row-modal-content').innerHTML;
    utils.openModal('Adicionar Linha de Segurança', modalContent, () => {
        const form = document.getElementById('form-add-row');
        if (!form) return;

        form.rowType.value = 'safety'; // Define o tipo de linha
        form.addEventListener('submit', dataHandlers.handleAddRow);
    });
});
    const ganttActionsMenu = document.getElementById('gantt-actions-menu');
    if (ganttActionsMenu) {
        const toggleButton = document.getElementById('btn-toggle-gantt-actions');
        const dropdown = document.getElementById('gantt-actions-dropdown');
        toggleButton.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            // Ignora cliques durante drag and drop
            if (state.isDragging) {
                return;
            }
            
            if (!ganttActionsMenu.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
    }

    document.getElementById('btn-add-efficiency-row')?.addEventListener('click', () => modalHandlers.openAddRowModal('efficiency'));
    document.getElementById('btn-add-security-row')?.addEventListener('click', () => modalHandlers.openAddRowModal('safety'));

    // Lógica do menu dropdown para ensaios de eficiência
    const efficiencyAssayMenu = document.getElementById('efficiency-assay-menu');
    if (efficiencyAssayMenu) {
        const toggleButton = document.getElementById('btn-toggle-efficiency-menu');
        const dropdown = document.getElementById('efficiency-dropdown');
        
        toggleButton?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        });
        
        document.addEventListener('click', (e) => {
            if (!efficiencyAssayMenu.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
    }

    // Lógica do menu dropdown para agendamentos (calibração e férias)
    const scheduleMenu = document.getElementById('schedule-menu');
    if (scheduleMenu) {
        const toggleButton = document.getElementById('btn-toggle-schedule-menu');
        const dropdown = document.getElementById('schedule-dropdown');

        toggleButton?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            // Ignora cliques durante drag and drop
            if (state.isDragging) {
                return;
            }

            if (!scheduleMenu.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
    }
    // Listener para tornar os nomes das linhas editáveis
    DOM.ganttLabelsContainer.addEventListener('dblclick', (e) => {
        const labelDiv = e.target.closest('.gantt-label');
        if (!labelDiv) return;

        const originalName = labelDiv.dataset.categoryName;
        if (['Férias', 'Pendentes'].includes(originalName)) {
            utils.showToast('Esta categoria não pode ser editada.', true);
            return;
        }

        labelDiv.innerHTML = `<input type="text" class="w-full h-full bg-gray-700 text-white text-center border-0 p-0" value="${originalName}">`;
        const input = labelDiv.querySelector('input');
        input.focus();
        input.select();

        const saveChange = () => {
            const newName = input.value.trim();
            if (!newName) {
                labelDiv.textContent = originalName;
                return;
            }
            
            let categoryFound = state.safetyCategories.find(cat => cat.name === originalName) || state.efficiencyCategories.find(cat => cat.name === originalName);
            if (categoryFound) {
                categoryFound.name = newName;
                dataHandlers.saveData();
                renderers.renderGanttChart();
                utils.showToast("Nome da linha atualizado!");
            }
        };
        
        const handleKey = (ev) => {
            if (ev.key === 'Enter') input.blur();
            else if (ev.key === 'Escape') {
                input.removeEventListener('blur', saveChange);
                input.removeEventListener('keydown', handleKey);
                labelDiv.textContent = originalName;
            }
        };
        
        input.addEventListener('blur', saveChange, { once: true });
        input.addEventListener('keydown', handleKey);
    });

    // Funcionalidades da página de Calibrações
    const calibrationsHandlers = {
        renderCalibrationsTable: () => {
            console.log('🔍 renderCalibrationsTable chamada');
            console.log('📊 state.calibrationEquipments:', state.calibrationEquipments);
            console.log('📊 Quantidade:', state.calibrationEquipments?.length || 0);
            
            const tbody = document.getElementById('calibrations-table-body');
            if (!tbody) {
                console.log('❌ tbody não encontrado');
                return;
            }
            console.log('✅ tbody encontrado');

            const tagFilter = document.getElementById('filter-tag-calibrations')?.value.toLowerCase() || '';
            const equipmentFilter = document.getElementById('filter-equipment-calibrations')?.value.toLowerCase() || '';
            console.log('🔍 Filtros aplicados - TAG:', tagFilter, 'EQUIPMENT:', equipmentFilter);

            let filteredEquipments = state.calibrationEquipments.filter(equipment => {
                const matchesTag = equipment.tag.toLowerCase().includes(tagFilter);
                const matchesEquipment = equipment.equipment.toLowerCase().includes(equipmentFilter);
                return matchesTag && matchesEquipment;
            });
            console.log('📊 Equipamentos após filtro:', filteredEquipments.length);

            // Ordena por data de validade (mais próximo do vencimento primeiro)
            filteredEquipments.sort((a, b) => new Date(a.validity) - new Date(b.validity));

            if (filteredEquipments.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-6 py-8 text-center text-gray-500">
                            <div class="flex flex-col items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                <p class="text-lg font-medium text-gray-900 mb-2">Nenhum equipamento registrado</p>
                                <p class="text-sm text-gray-500">Clique em "Adicionar Equipamento" para começar</p>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = filteredEquipments.map(equipment => {
                const validityDate = new Date(equipment.validity);
                const today = new Date();
                const daysUntilExpiry = Math.ceil((validityDate - today) / (1000 * 60 * 60 * 24));
                
                let statusClass = '';
                let statusText = '';
                
                // Verifica se equipamento está em calibração
                if (equipment.calibrationStatus === 'em_calibracao') {
                    statusClass = 'bg-blue-100 text-blue-800';
                    statusText = 'Em calibração';
                } else if (daysUntilExpiry < 0) {
                    statusClass = 'bg-red-100 text-red-800';
                    statusText = 'Vencido';
                } else if (daysUntilExpiry <= 15) {
                    statusClass = 'bg-yellow-100 text-yellow-800';
                    statusText = 'Próximo do vencimento';
                } else {
                    statusClass = 'bg-green-100 text-green-800';
                    statusText = 'Em dia';
                }
                
                // Define o botão de calibração baseado no status
                const isInCalibration = equipment.calibrationStatus === 'em_calibracao';
                const calibrationButtonText = isInCalibration ? 'Calibração Finalizada' : 'Equip. Calibrando';
                const calibrationButtonClass = isInCalibration ? 'btn-finish-calibration' : 'btn-start-calibration';
                const calibrationButtonColor = isInCalibration ? 'text-green-600 hover:text-green-900' : 'text-blue-600 hover:text-blue-900';
                
                // Define o ícone baseado no status
                const calibrationButtonIcon = isInCalibration ? 
                    `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>` :
                    `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>`;

                return `
                    <tr class="hover:bg-gray-50">
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            <button class="btn-view-equipment-details text-blue-600 hover:text-blue-900 font-medium" data-id="${equipment.id}" title="Ver detalhes do equipamento">
                                ${equipment.tag}
                            </button>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${equipment.equipment}</td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">
                                ${statusText}
                            </span>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${utils.formatDate(equipment.validity)}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                            <button class="${calibrationButtonClass} ${calibrationButtonColor} mr-2 p-2 rounded hover:bg-gray-100" data-id="${equipment.id}" title="${calibrationButtonText}">
                                ${calibrationButtonIcon}
                            </button>
                            <button class="btn-edit-calibration-equipment text-gray-600 hover:text-gray-900 mr-2" data-id="${equipment.id}" title="Editar">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </button>
                            <button class="btn-delete-calibration-equipment text-red-600 hover:text-red-900" data-id="${equipment.id}" title="Excluir">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        },

        startCalibration: (equipmentId) => {
            console.log('[CALIBRATION] 🔧 Iniciando calibração para equipamento ID:', equipmentId);
            
            const equipment = state.calibrationEquipments.find(e => e.id == equipmentId);
            if (!equipment) {
                console.error('[CALIBRATION] ❌ Equipamento não encontrado:', equipmentId);
                utils.showToast('Equipamento não encontrado.', true);
                return;
            }
            
            console.log('[CALIBRATION] 🔧 Equipamento encontrado:', equipment);
            console.log('[CALIBRATION] 🔧 Status anterior:', equipment.calibrationStatus);
            
            // Atualiza status para em calibração
            equipment.calibrationStatus = 'em_calibracao';
            equipment.calibrationStartDate = new Date().toISOString().split('T')[0];
            
            console.log('[CALIBRATION] 🔧 Novo status:', equipment.calibrationStatus);
            console.log('[CALIBRATION] 🔧 Data de início:', equipment.calibrationStartDate);
            console.log('[CALIBRATION] 🔧 Chamando saveData...');
            
            // Verificar se o estado foi preservado antes de salvar
            const equipmentAfterUpdate = state.calibrationEquipments.find(e => e.id == equipmentId);
            console.log('[CALIBRATION] 🔧 Estado do equipamento antes de saveData:', equipmentAfterUpdate);
            
            dataHandlers.saveData();
            calibrationsHandlers.renderCalibrationsTable();
            utils.showToast(`Equipamento ${equipment.tag} marcado como "Em calibração".`);
            
            console.log('[CALIBRATION] ✅ Processo de iniciar calibração concluído');
        },
        
        openFinishCalibrationModal: (equipmentId) => {
            const equipment = state.calibrationEquipments.find(e => e.id == equipmentId);
            if (!equipment) {
                utils.showToast('Equipamento não encontrado.', true);
                return;
            }
            
            const modalContent = document.getElementById('finish-calibration-modal-content').innerHTML;
            utils.openModal('Finalizar Calibração', modalContent, () => {
                const form = document.getElementById('form-finish-calibration');
                if (!form) return;
                
                // Preenche informações do equipamento
                document.getElementById('finish-calibration-equipment-id').value = equipment.id;
                document.getElementById('finish-calibration-equipment-name').textContent = equipment.equipment;
                document.getElementById('finish-calibration-equipment-tag').textContent = equipment.tag;
                
                // Define data mínima como hoje
                const today = new Date().toISOString().split('T')[0];
                document.getElementById('new-calibration-validity').min = today;
                
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    calibrationsHandlers.handleFinishCalibration();
                });
                
                const cancelButton = form.querySelector('.btn-close-modal');
                if (cancelButton) {
                    cancelButton.addEventListener('click', () => utils.closeModal());
                }
            });
        },
        
        handleFinishCalibration: () => {
            const form = document.getElementById('form-finish-calibration');
            if (!form) return;
            
            const formData = new FormData(form);
            const equipmentId = formData.get('equipmentId');
            const newValidity = formData.get('newValidity');
            const calibrationNotes = formData.get('calibrationNotes');
            
            if (!newValidity) {
                utils.showToast('Por favor, defina a nova data de validade.', true);
                return;
            }
            
            const equipment = state.calibrationEquipments.find(e => e.id == equipmentId);
            if (!equipment) {
                utils.showToast('Equipamento não encontrado.', true);
                return;
            }
            
            // Atualiza equipamento
            const finalizationDate = new Date().toISOString().split('T')[0];
            
            equipment.calibrationStatus = 'operacional';
            equipment.validity = newValidity;
            equipment.lastCalibrationDate = finalizationDate; // Data de finalização da calibração
            equipment.calibrationNotes = calibrationNotes;
            // Mantém equipment.calibrationStartDate para histórico de quantos dias demorou a calibração
            
            dataHandlers.saveData();
            calibrationsHandlers.renderCalibrationsTable();
            utils.closeModal();
            utils.showToast(`Calibração do equipamento ${equipment.tag} finalizada com sucesso!`);
        },

        openAddCalibrationEquipmentModal: () => {
            const modalContent = document.getElementById('calibration-equipment-modal-content').innerHTML;
            utils.openModal('Adicionar Equipamento de Calibração', modalContent, () => {
                const form = document.getElementById('form-calibration-equipment');
                if (!form) return;
                
                form.reset();
                document.getElementById('calibration-equipment-id').value = '';
                
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    calibrationsHandlers.handleSaveCalibrationEquipment();
                });
                
                const cancelButton = form.querySelector('.btn-close-modal');
                if (cancelButton) {
                    cancelButton.addEventListener('click', () => utils.closeModal());
                }
            });
        },

        openEditCalibrationEquipmentModal: (equipmentId) => {
            const equipment = state.calibrationEquipments.find(e => e.id == equipmentId);
            if (!equipment) {
                utils.showToast('Equipamento não encontrado.', true);
                return;
            }

            const modalContent = document.getElementById('calibration-equipment-modal-content').innerHTML;
            utils.openModal('Editar Equipamento de Calibração', modalContent, () => {
                const form = document.getElementById('form-calibration-equipment');
                if (!form) return;
                
                document.getElementById('calibration-equipment-id').value = equipment.id;
                document.getElementById('calibration-tag').value = equipment.tag;
                document.getElementById('calibration-equipment').value = equipment.equipment;
                document.getElementById('calibration-validity').value = equipment.validity;
                document.getElementById('calibration-observations').value = equipment.observations || '';
                
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    calibrationsHandlers.handleSaveCalibrationEquipment();
                });
                
                const cancelButton = form.querySelector('.btn-close-modal');
                if (cancelButton) {
                    cancelButton.addEventListener('click', () => utils.closeModal());
                }
            });
        },

        handleSaveCalibrationEquipment: () => {
            const form = document.getElementById('form-calibration-equipment');
            const formData = new FormData(form);
            
            const equipmentData = {
                id: formData.get('id') || Date.now(),
                tag: formData.get('tag'),
                equipment: formData.get('equipment'),
                validity: formData.get('validity'),
                observations: formData.get('observations') || ''
            };

            if (!equipmentData.tag || !equipmentData.equipment || !equipmentData.validity) {
                utils.showToast('Por favor, preencha todos os campos obrigatórios.', true);
                return;
            }

            const existingIndex = state.calibrationEquipments.findIndex(e => e.id == equipmentData.id);
            
            if (existingIndex >= 0) {
                state.calibrationEquipments[existingIndex] = equipmentData;
                utils.showToast('Equipamento atualizado com sucesso!');
            } else {
                state.calibrationEquipments.push(equipmentData);
                utils.showToast('Equipamento adicionado com sucesso!');
            }

            dataHandlers.saveData();
            calibrationsHandlers.renderCalibrationsTable();
            utils.closeModal();
        },

        handleDeleteCalibrationEquipment: (equipmentId) => {
            const equipment = state.calibrationEquipments.find(e => e.id == equipmentId);
            if (!equipment) {
                utils.showToast('Equipamento não encontrado.', true);
                return;
            }

            const message = `Tem certeza que deseja excluir o equipamento "${equipment.equipment}" (TAG: ${equipment.tag})?`;
            ui.showConfirmationModal(message, () => {
                // Enviar comando para o backend excluir do banco de dados
                vscode.postMessage({
                    command: 'deleteCalibrationEquipment',
                    data: { id: equipmentId }
                });
            });
        },

        openEquipmentDetailsModal: (equipmentId) => {
            const equipment = state.calibrationEquipments.find(e => e.id == equipmentId);
            if (!equipment) {
                utils.showToast('Equipamento não encontrado.', true);
                return;
            }

            const modalContent = document.getElementById('equipment-details-modal-content').innerHTML;
            utils.openModal('Detalhes do Equipamento', modalContent, () => {
                // Preenche as informações do equipamento
                document.getElementById('equipment-details-tag').textContent = equipment.tag;
                document.getElementById('equipment-details-name').textContent = equipment.equipment;
                document.getElementById('equipment-details-validity').textContent = utils.formatDate(equipment.validity);
                document.getElementById('equipment-details-notes').textContent = equipment.observations || 'Nenhuma observação registrada';

                // Define o status com as classes corretas
                const statusElement = document.getElementById('equipment-details-status');
                const today = new Date();
                const validityDate = new Date(equipment.validity);
                const daysUntilExpiry = Math.ceil((validityDate - today) / (1000 * 60 * 60 * 24));
                
                let statusClass, statusText;
                if (equipment.calibrationStatus === 'em_calibracao') {
                    statusClass = 'bg-blue-100 text-blue-800';
                    statusText = 'Em calibração';
                } else if (daysUntilExpiry < 0) {
                    statusClass = 'bg-red-100 text-red-800';
                    statusText = 'Vencido';
                } else if (daysUntilExpiry <= 15) {
                    statusClass = 'bg-yellow-100 text-yellow-800';
                    statusText = 'Próximo do vencimento';
                } else {
                    statusClass = 'bg-green-100 text-green-800';
                    statusText = 'Em dia';
                }
                
                statusElement.className = `inline-flex px-3 py-1 text-xs font-semibold rounded-full ${statusClass}`;
                statusElement.textContent = statusText;

                // Observações
                const notesElement = document.getElementById('equipment-details-notes');
                if (equipment.observations && equipment.observations.trim()) { 
                    notesElement.textContent = equipment.observations;         
                } else {
                    notesElement.textContent = 'Nenhuma observação registrada';
                }

                // Event listener para o botão fechar
                const closeButton = document.querySelector('.btn-close-modal');
                if (closeButton) {
                    closeButton.addEventListener('click', () => utils.closeModal());
                }
            });
        }
    };

    // Adiciona renderCalibrationsTable ao objeto renderers
    renderers.renderCalibrationsTable = calibrationsHandlers.renderCalibrationsTable;

    // Event listeners para a página de Calibrações
    document.getElementById('btn-add-calibration-equipment')?.addEventListener('click', () => {
        calibrationsHandlers.openAddCalibrationEquipmentModal();
    });

    // Filtros da página de Calibrações
    document.getElementById('filter-tag-calibrations')?.addEventListener('input', calibrationsHandlers.renderCalibrationsTable);
    document.getElementById('filter-equipment-calibrations')?.addEventListener('input', calibrationsHandlers.renderCalibrationsTable);

    // Event listeners para botões de ação na tabela de calibrações
    document.body.addEventListener('click', (e) => {
        if (e.target.closest('.btn-edit-calibration-equipment')) {
            const equipmentId = e.target.closest('.btn-edit-calibration-equipment').dataset.id;
            calibrationsHandlers.openEditCalibrationEquipmentModal(parseInt(equipmentId));
        } else if (e.target.closest('.btn-delete-calibration-equipment')) {
            const equipmentId = e.target.closest('.btn-delete-calibration-equipment').dataset.id;
            calibrationsHandlers.handleDeleteCalibrationEquipment(parseInt(equipmentId));
        } else if (e.target.closest('.btn-start-calibration')) {
            const equipmentId = e.target.closest('.btn-start-calibration').dataset.id;
            calibrationsHandlers.startCalibration(parseInt(equipmentId));
        } else if (e.target.closest('.btn-finish-calibration')) {
            const equipmentId = e.target.closest('.btn-finish-calibration').dataset.id;
            calibrationsHandlers.openFinishCalibrationModal(parseInt(equipmentId));
        } else if (e.target.closest('.btn-view-equipment-details')) {
            const equipmentId = e.target.closest('.btn-view-equipment-details').dataset.id;
            calibrationsHandlers.openEquipmentDetailsModal(parseInt(equipmentId));
        }
    });

    // Listener para o atalho de teclado Ctrl+Z
    document.addEventListener('keydown', (event) => {
        const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z';
        if (isUndo) {
            event.preventDefault();
            undoManager.undo();
        }
    });
     document.getElementById('zoom-in-gantt-btn')?.addEventListener('click', () => {
        const maxZoom = 45; // Largura máxima da coluna
        if (state.ganttZoomLevel < maxZoom) {
            state.ganttZoomLevel += 5; // Aumenta a largura em 5px
            state.ganttRowHeightLevel = state.ganttZoomLevel * 3.2;
            // Atualiza escala de texto proporcional ao zoom
            const base = 25; // nível base corresponde a escala 1
            const scale = Math.max(0.6, Math.min(1.6, state.ganttZoomLevel / base));
            const scroll = DOM.ganttScrollContainer;
            if (scroll) scroll.style.setProperty('--gantt-text-scale', String(scale));
            renderers.renderGanttChart();
            ui.scrollToTodayInGantt();
            
        }
    });

    document.getElementById('zoom-out-gantt-btn')?.addEventListener('click', () => {
        const minZoom = 15; // Largura mínima da coluna
        if (state.ganttZoomLevel > minZoom) {
            state.ganttZoomLevel -= 5; // Diminui a largura em 5px
            state.ganttRowHeightLevel = state.ganttZoomLevel * 3.2;
            // Atualiza escala de texto proporcional ao zoom
            const base = 25;
            const scale = Math.max(0.6, Math.min(1.6, state.ganttZoomLevel / base));
            const scroll = DOM.ganttScrollContainer;
            if (scroll) scroll.style.setProperty('--gantt-text-scale', String(scale));
            renderers.renderGanttChart();
            ui.scrollToTodayInGantt();
        }
    });
    const bell = document.getElementById('notification-bell');
    const panel = document.getElementById('notification-panel');
    const clearBtn = document.getElementById('clear-notifications-btn');
    bell?.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            uiHelpers.renderNotificationPanel();
            state.unreadNotifications = 0;
            uiHelpers.updateNotificationBadge();
        }
    });

    // Fecha o painel se clicar fora dele
    document.addEventListener('click', (e) => {
        if (panel && !panel.classList.contains('hidden') && !bell.contains(e.target) && !panel.contains(e.target)) {
            panel.classList.add('hidden');
        }
    });
    clearBtn?.addEventListener('click', () => {
        notificationSystem.clearHistory(); // Limpa os dados
        uiHelpers.renderNotificationPanel(); // Re-renderiza o painel (que agora estará vazio)
        utils.showToast("Notificações limpas com sucesso.");
    });
    document.getElementById("nav-forecast").addEventListener("click", () => {
    document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
    document.getElementById("page-forecast").classList.remove("hidden");
    forecastSystem.renderAll();
});



    // Início da aplicação
    authSystem.init();
    console.log("Webview está pronta e todos os listeners estão ativos.");
});

// Botões de ações do cronograma
DOM.btnCancelSchedule?.addEventListener('click', () => {
    undoManager.undo();
    // Reverte arrays para o estado original
    state.scheduledAssays = JSON.parse(JSON.stringify(state.originalScheduledAssays || []));
    state.safetyScheduledAssays = JSON.parse(JSON.stringify(state.originalSafetyScheduledAssays || []));
    state.calibrations = JSON.parse(JSON.stringify(state.originalCalibrations || []));
    // Reconstroi vínculos a partir das observações originais
    state.assayLinks = [];
    const safetyById = new Map((state.safetyScheduledAssays || []).map(a => [Number(a.id), a]));
    (state.scheduledAssays || []).forEach(eff => {
        const obs = String(eff.observacoes || '');
        const m = obs.match(/\[link_safety:(\d+)\]/);
        if (m) {
            const sid = Number(m[1]);
            if (safetyById.has(sid)) {
                const exists = state.assayLinks.some(l => l.from === eff.id && l.to === sid);
                if (!exists) state.assayLinks.push({ from: eff.id, to: sid });
            }
        }
    });
    (state.safetyScheduledAssays || []).forEach(saf => {
        const obs = String(saf.observacoes || '');
        const m = obs.match(/\[link_efficiency:(\d+)\]/);
        if (m) {
            const eid = Number(m[1]);
            const exists = state.assayLinks.some(l => l.from === eid && l.to === saf.id);
            if (!exists) state.assayLinks.push({ from: eid, to: saf.id });
        }
    });
    state.hasUnsavedChanges = false;
    ui.toggleScheduleActions(false);
    renderers.renderGanttChart();
    utils.showToast('Alterações canceladas.');
});


