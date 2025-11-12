// webview/main-cargo.js

// Global utils object - accessible throughout the file


(function () {
    // Registrar plugin ChartDataLabels se disponível
    if (window.ChartDataLabels && typeof Chart !== 'undefined') {
        try {
            Chart.register(ChartDataLabels);
            console.log('ChartDataLabels plugin registrado com sucesso');
        } catch (error) {
            console.warn('Erro ao registrar ChartDataLabels:', error);
        }
    }

    // Configuração da API do VS Code
    const vscode = acquireVsCodeApi();
    
    // Make vscode globally accessible
    window.vscode = vscode;



    // Estado local para a página de controle de carga
    let state = {
        activePieces: [],
        activeProtocols: [],
        protocolsWithStatus: [],
        modalPreselect: null,
        currentUser: null,
        isAuthenticated: false,
        accessDenied: false,
        chartData: { active: null, available: null }
    };

    let pecasParaCadastrar = [];

    // Referências DOM para controle de loading
    const DOM = {
        loadingSpinner: document.getElementById('loading-spinner'),
        loadingStatus: document.getElementById('loading-status'),
        mainInterface: document.getElementById('main-interface')
    };

    const ui = {
    /** Exibe um modal de confirmação customizado. */
    showConfirmationModal: (message, onConfirm) => {
        const confirmationModal = document.getElementById('confirmation-modal');
        const confirmationMessage = document.getElementById('confirmation-message');
        const confirmBtn = document.getElementById('btn-confirm-action');
        const cancelBtn = document.getElementById('btn-confirm-cancel');
        
        if (!confirmationModal || !confirmationMessage || !confirmBtn || !cancelBtn) {
            console.error('Elementos do modal de confirmação não encontrados');
            return;
        }
        
        // Atualizar mensagem
        confirmationMessage.textContent = message;
        
        // Mostrar modal
        confirmationModal.classList.remove('hidden');
        
        // Limpar event listeners anteriores
        const newConfirmBtn = confirmBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        // Adicionar novos event listeners
        newConfirmBtn.addEventListener('click', () => {
            onConfirm();
            confirmationModal.classList.add('hidden');
        });
        
        newCancelBtn.addEventListener('click', () => {
            confirmationModal.classList.add('hidden');
        });
    }
};


    window.ui = ui;

    // Utilitários para controle de loading
    const loadingUtils = {
        /** Exibe o spinner de carregamento */
        showLoading: () => {
            if (DOM.loadingSpinner) {
                DOM.loadingSpinner.classList.remove('hidden');
            }
        },
        
        /** Esconde o spinner de carregamento com transição suave */
        hideLoading: () => {
            if (DOM.loadingSpinner) {
                // Adiciona uma transição suave antes de esconder
                DOM.loadingSpinner.style.opacity = '0';
                setTimeout(() => {
                    DOM.loadingSpinner.classList.add('hidden');
                    DOM.loadingSpinner.style.opacity = '1'; // Reset para próxima vez
                }, 500);
            }
        },
        
        /** Atualiza o status de carregamento com animação */
        updateStatus: (message) => {
            if (DOM.loadingStatus) {
                // Animação de fade out/in para mudança de texto
                DOM.loadingStatus.style.opacity = '0.5';
                setTimeout(() => {
                    DOM.loadingStatus.textContent = message;
                    DOM.loadingStatus.style.opacity = '1';
                }, 150);
            }
        },
        
        /** Mostra a interface principal com animação */
        showMainInterface: () => {
            if (DOM.mainInterface) {
                DOM.mainInterface.classList.remove('hidden');
                // Força o reflow para garantir que a animação CSS funcione
                DOM.mainInterface.offsetHeight;
            }
        },
        
        /** Esconde a interface principal */
        hideMainInterface: () => {
            if (DOM.mainInterface) {
                DOM.mainInterface.classList.add('hidden');
            }
        }
    };

    // Objeto utils global - contém funções utilitárias usadas em todo o arquivo
    window.utils = {
        /** Exibe o spinner de carregamento. */
        showLoading: () => DOM.loadingSpinner?.classList.remove('hidden'),
        /** Esconde o spinner de carregamento. */
        hideLoading: () => DOM.loadingSpinner?.classList.add('hidden'),

        /**
         * Exibe um toast de notificação na tela.
         * @param {string} message - A mensagem a ser exibida.
         * @param {boolean} [isError=false] - Se true, a mensagem é um erro e tem cor vermelha.
         */
        showToast: (message, isError = false) => {
            // Bloqueia notificações para usuários visualizadores
            if (state.currentUser && state.currentUser.permissions && state.currentUser.permissions.viewOnly) {
                return;
            }
            
            // Cria um toast simples se não houver sistema de notificações
            const toast = document.createElement('div');
            toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-all duration-300 ${
                isError ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
            }`;
            toast.textContent = message;
            
            document.body.appendChild(toast);
            
            // Remove o toast após 3 segundos
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }, 3000);
        },

        /**
         * Função debounce para limitar a frequência de execução de uma função.
         * @param {Function} func - A função a ser executada com debounce.
         * @param {number} delay - O atraso em milissegundos.
         * @returns {Function} - A função com debounce aplicado.
         */
        debounce: (func, delay) => {
            let timeoutId;
            return function (...args) {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => func.apply(this, args), delay);
            };
        },

        /**
         * Abre um modal com o título e conteúdo especificados.
         * @param {string} title - O título do modal.
         * @param {string} contentHTML - O conteúdo HTML do modal.
         * @param {Function} [onOpen] - Uma função de callback para ser executada quando o modal for aberto.
         */
        openModal: (title, contentHTML, onOpen) => {
            const modal = document.getElementById('modal-template');
            if (!modal) return;
            
            const modalContent = modal.querySelector('.modal-content');
            const modalTitle = modal.querySelector('.modal-title');
            
            if (modalTitle) modalTitle.textContent = title;
            if (modalContent) {
                modalContent.innerHTML = contentHTML;
                // Força as cores corretas no conteúdo do modal
                modalContent.style.color = '#1f2937'; // text-gray-800
            }
            
            modal.classList.remove('hidden');
            modal.classList.add('visible');
            
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
            const modal = document.getElementById('modal-template');
            if (!modal) return;
            
            const modalContent = modal.querySelector('.modal-content');
            
            // Remove a classe show
            if (modalContent) {
                modalContent.classList.remove('show');
            }
            
            // Fecha o modal imediatamente sem animação
            modal.classList.add('hidden');
            modal.classList.remove('visible');
            
            // Limpa estados relacionados ao modal
            state.selectedAssayId = null;
            state.selectedReagentId = null;
        },

        /**
         * Formata uma string de data (YYYY-MM-DD) para o formato 'pt-BR'.
         * @param {string} dateStr - A string de data.
         * @returns {string} A data formatada.
         */
        formatDate: (dateStr) => {
            if (!dateStr) return 'N/A';
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
        }
    };

    // Referência local para compatibilidade
    const utils = window.utils;

    // Sistema de autenticação para controle de acesso
    const authSystem = {
        /**
         * Define o usuário atual (usado pelo login automático)
         * @param {Object} user - Dados do usuário
         */
        setCurrentUser: (user) => {
            loadingUtils.updateStatus('Verificando permissões de usuário...');
            
            state.currentUser = user;
            state.isAuthenticated = true;
            
            // Simula um pequeno delay para mostrar o loading
            setTimeout(() => {
                // Verifica se o usuário tem permissão para acessar esta página
                if (!authSystem.hasAccessPermission()) {
                    state.accessDenied = true;
                    loadingUtils.updateStatus('Acesso negado');
                    setTimeout(() => {
                        authSystem.showAccessDeniedScreen();
                    }, 500);
                    return;
                }
                
                state.accessDenied = false;
                loadingUtils.updateStatus('Carregando interface...');
                setTimeout(() => {
                    authSystem.showMainInterface();
                }, 300);
            }, 500);
        },

        /**
         * Verifica se o usuário atual tem permissão para acessar a página de controle de carga
         * @returns {boolean} - True se o usuário tem permissão
         */
        hasAccessPermission: () => {
            
            if (!state.currentUser) {
                return false;
            }
            
            const userType = state.currentUser.type;
            
            // Apenas administradores e técnicos podem acessar
            const hasAccess = userType === 'administrador' || 
                             userType === 'tecnico_eficiencia' || 
                             userType === 'tecnico_seguranca';
            
            return hasAccess;
        },

        /**
         * Mostra a tela de acesso negado para visualizadores
         */
        showAccessDeniedScreen: () => {
            // Esconde o loading e mostra a tela de acesso negado
            loadingUtils.hideLoading();
            
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.innerHTML = `
                    <div class="flex items-center justify-center min-h-screen bg-gray-100">
                        <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
                            <div class="mb-6">
                                <svg class="mx-auto h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <h2 class="text-2xl font-bold text-gray-900 mb-4">Acesso Restrito</h2>
                            <p class="text-gray-600 mb-6">
                                Esta página é restrita apenas para <strong>Técnicos</strong> e <strong>Administradores</strong>.
                            </p>
                            <div class="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
                                <div class="flex">
                                    <div class="flex-shrink-0">
                                        <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                        </svg>
                                    </div>
                                    <div class="ml-3">
                                        <p class="text-sm text-yellow-700">
                                            Usuário atual: <strong>${state.currentUser?.displayName || 'Desconhecido'}</strong><br>
                                            Tipo: <strong>${state.currentUser?.type || 'Não definido'}</strong>
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <p class="text-sm text-gray-500">
                                Entre em contato com o administrador do sistema para solicitar as permissões necessárias.
                            </p>
                        </div>
                    </div>
                `;
            }
        },

        /**
         * Verifica se o usuário atual tem acesso para realizar ações (alias para hasAccessPermission)
         * @returns {boolean} - True se o usuário tem permissão
         */
        hasAccess: () => {
            return authSystem.hasAccessPermission();
        },

        /**
         * Mostra a interface principal após autenticação bem-sucedida
         */
        showMainInterface: () => {
            
            // Esconde o loading e mostra a interface principal
            loadingUtils.hideLoading();
            loadingUtils.showMainInterface();
        }
    };

    /**
     * Ponto de entrada principal para a página de Controle de Carga.
     * Esta função será chamada pelo controle-carga.html quando o script for carregado.
     */
    function initializeLoadControl() {
        
        // Mostra o loading inicial
        loadingUtils.showLoading();
        loadingUtils.updateStatus('Detectando usuário do sistema...');
        
        // Verifica se estamos no ambiente do VS Code
        if (typeof acquireVsCodeApi === 'undefined') {
            loadingUtils.updateStatus('Execute no VS Code para funcionalidade completa');
            
            setTimeout(() => {
                loadingUtils.hideLoading();
                const mainContent = document.querySelector('.main-content') || document.body;
                mainContent.innerHTML = `
                    <div class="flex items-center justify-center min-h-screen bg-gray-100">
                        <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
                            <div class="mb-6">
                                <svg class="mx-auto h-16 w-16 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h2 class="text-2xl font-bold text-gray-900 mb-4">Execute no VS Code</h2>
                            <p class="text-gray-600 mb-6">
                                Para usar o <strong>Controle de Carga</strong>, você precisa executar esta extensão dentro do VS Code.
                            </p>
                            <div class="bg-blue-50 p-4 rounded-lg mb-6">
                                <p class="text-sm text-blue-800">
                                    <strong>Como usar:</strong><br>
                                    1. Abra o VS Code<br>
                                    2. Pressione <code>Ctrl+Shift+P</code><br>
                                    3. Digite "Abrir Controle de Insumos"<br>
                                    4. Acesse a aba "Controle de Carga"
                                </p>
                            </div>
                        </div>
                    </div>
                `;
            }, 1000);
            return;
        }

        // Solicita dados do usuário ao backend
        loadingUtils.updateStatus('Conectando com o sistema...');
        
        // Solicita dados do sistema (incluindo informações de usuário)
        vscode.postMessage({ 
            command: 'webviewReady',
            source: 'loadControl'
        });
        
        // Aguarda resposta do backend com timeout
        setTimeout(() => {
            loadingUtils.updateStatus('Verificando autenticação...');
            
            // Aguarda um momento para receber informações de autenticação do backend
            setTimeout(() => {
                // Se não há usuário autenticado após timeout, trata como visualizador
                if (!state.currentUser) {
                    authSystem.setCurrentUser({
                        username: 'unknown',
                        type: 'visualizador',
                        displayName: 'Visualizador',
                        permissions: { viewOnly: true }
                    });
                    return;
                }

                // Se o acesso foi negado, não continua a inicialização
                if (state.accessDenied) {
                    return;
                }

                loadingUtils.updateStatus('Carregando interface...');
                
                // Simula carregamento da interface
                setTimeout(() => {
                    // Continua com a inicialização normal se o usuário tem permissão
                    setupTabSwitching();
                    setupActionButtons();
                    setupFilters();
                    setupProcessTableListeners();
                    setupModalListeners();
                    
                    // Renderizar página de controle de carga
                    renderers.renderControleCargaPage();
                    
                    // Carregar dados iniciais
                    loadInitialData();
                    
                    // Mostra a interface principal
                    authSystem.showMainInterface();
                    
                    // Garantir que as tabelas sejam renderizadas após a interface estar visível
                    setTimeout(() => {
                        if (state.activePieces && state.activePieces.length > 0) {
                            console.log('🔄 Renderizando tabelas após interface estar visível...');
                            renderActiveTables();
                        }
                    }, 200);
                }, 500);
            }, 100); // Aguarda 100ms para receber dados de autenticação
        }, 300);
    }
    // Expondo a função para o escopo global para que o HTML possa chamá-la.
    window.initializeLoadControl = initializeLoadControl;


    /**
     * Configura a troca entre as abas "Dashboard" e "Processos de Carga".
     */
    function setupTabSwitching() {
        const dashboardTab = document.getElementById('tab-controle-dashboard');
        const processosTab = document.getElementById('tab-controle-processos');
        const dashboardPanel = document.getElementById('controle-dashboard-panel');
        const processosPanel = document.getElementById('controle-processos-panel');

        // Previne múltiplos event listeners
        if (dashboardTab.hasAttribute('data-tab-listener')) return;
        dashboardTab.setAttribute('data-tab-listener', 'true');
        processosTab.setAttribute('data-tab-listener', 'true');

        dashboardTab.addEventListener('click', function () {
            
            // Evita reprocessamento se já está ativa
            if (dashboardTab.classList.contains('active')) {
                return;
            }
            
            dashboardTab.classList.add('active');
            processosTab.classList.remove('active');
            dashboardPanel.classList.remove('hidden');
            processosPanel.classList.add('hidden');
            
            // Renderiza gráficos com dados armazenados ou solicita novos dados
            setTimeout(() => {
                
                // Verifica se os gráficos já existem e estão funcionais
                const chartIds = ['chart-fronhas', 'chart-toalhas', 'chart-lencol'];
                const existingCharts = chartIds.filter(id => window.charts && window.charts[id]);
                
                if (existingCharts.length === chartIds.length && state.chartDistributionData) {
                    // Força uma atualização suave dos gráficos existentes
                    chartIds.forEach(chartId => {
                        if (window.charts[chartId]) {
                            window.charts[chartId].update('none'); // Atualização sem animação
                        }
                    });
                } else if (state.chartDistributionData) {
                   renderers.renderPecasCargaCharts(state.chartDistributionData);
                } else {
                    vscode.postMessage({ command: 'getPecasCycleDistribution', source: 'dashboardSwitch' });
                }
            }, 150); // Aumentado para 150ms para garantir que o DOM esteja estável
        });

        processosTab.addEventListener('click', function () {
            
            // Evita reprocessamento se já está ativa
            if (processosTab.classList.contains('active')) {
                return;
            }
            
            processosTab.classList.add('active');
            dashboardTab.classList.remove('active');
            processosPanel.classList.remove('hidden');
            dashboardPanel.classList.add('hidden');
            // Ao ativar a aba, solicita os dados dos processos.
            vscode.postMessage({ command: 'getProtocolosComStatus', source: 'loadControl' });
        });
    }

    /**
     * Anexa os event listeners aos botões de ação principais.
     */
    function setupActionButtons() {
        document.getElementById('btn-cadastrar-carga-nova')?.addEventListener('click', () => {
            
            modalHandlers.openCadastrarCargaNovaModal();
        });
        document.getElementById('btn-cadastrar-protocolo')?.addEventListener('click', () => {
            
            modalHandlers.openCadastrarProtocoloModal();
        });
        document.getElementById('btn-peca-danificada')?.addEventListener('click', () => {
            
            modalHandlers.openPecaDanificadaModal();
        });
        document.getElementById('btn-pecas-inativas')?.addEventListener('click', () => {
            
            modalHandlers.openPecasInativasModal();
        });
        document.getElementById('btn-consultar-protocolo')?.addEventListener('click', () => {
            
            modalHandlers.openConsultarProtocoloModal();
        });
        document.getElementById('btn-descadastrar-protocolo')?.addEventListener('click', () => {
            
            modalHandlers.openDescadastrarProtocoloModal();
        });
        document.getElementById('btn-historico-protocolos')?.addEventListener('click', () => {

            modalHandlers.openHistoricoProtocolosModal();
        });
    }

    /**
     * Configura os inputs de filtro para as tabelas.
     */
    function setupFilters() {
        document.getElementById('filter-fronhas')?.addEventListener('input', renderActiveTables);
        document.getElementById('filter-toalhas')?.addEventListener('input', renderActiveTables);
        document.getElementById('filter-lencol')?.addEventListener('input', renderActiveTables);
        document.getElementById('filter-prep-protocol')?.addEventListener('input', renderProcessosTable);
    }

    /**
     * Configura os event listeners para os botões da tabela de processos.
     */
    function setupProcessTableListeners() {
        const processTable = document.getElementById('preparacao-carga-table-body');
        if (!processTable) return;

        // Event delegation para capturar cliques nos botões da tabela
        processTable.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            const protocolo = button.getAttribute('data-protocolo');
            const ciclo = button.getAttribute('data-ciclo');
            const action = button.getAttribute('data-action');

            if (ciclo) {
                // Botões "Consultar" para ciclo frio ou quente
                handleConsultarCiclo(protocolo, ciclo);
            } else if (action === 'add-piece') {
                // Botão "Adicionar Peça"
                handleAdicionarPeca(protocolo);
            } else if (action === 'delete-row') {
                // Botão "Excluir Linha"
                handleExcluirLinha(protocolo);
            } else if (action === 'edit-protocol') {
                modalHandlers.openEditProtocolModal(protocolo);
            }
        });
    }

    /**
     * Configura os event listeners para os modais.
     */
    function setupModalListeners() {
        // Event listener para fechar modal clicando no botão X
        document.addEventListener('click', function(event) {
            if (event.target.closest('.modal-close-btn')) {
                utils.closeModal();
            }
        });

        // Event listener para fechar modal clicando fora dele
        const modalTemplate = document.getElementById('modal-template');
        if (modalTemplate) {
            modalTemplate.addEventListener('click', function(event) {
                if (event.target === modalTemplate) {
                    utils.closeModal();
                }
            });
        }

        // Event listeners para modal de confirmação
        const confirmationModal = document.getElementById('confirmation-modal');
        if (confirmationModal) {
            const cancelBtn = document.getElementById('btn-confirm-cancel');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', function() {
                    confirmationModal.classList.add('hidden');
                });
            }

            // Fechar modal de confirmação clicando fora dele
            confirmationModal.addEventListener('click', function(event) {
                if (event.target === confirmationModal) {
                    confirmationModal.classList.add('hidden');
                }
            });
        }
    }

    /**
     * Manipula o clique no botão "Consultar" para ciclo frio ou quente.
     */
    function handleConsultarCiclo(protocolo, ciclo) {
        
        // Enviar comando para o backend consultar dados do ciclo
        vscode.postMessage({ 
            command: 'consultarCicloPreparacao', 
            protocolo: protocolo, 
            tipoCiclo: ciclo 
        });
        
        utils.showToast(`Consultando dados do ciclo ${ciclo} para protocolo ${protocolo}...`);
    }

    /**
     * Manipula o clique no botão "Adicionar Peça".
     */
    function handleAdicionarPeca(protocolo) {
        
        // Abrir modal para adicionar peça ao protocolo
        modalHandlers.openAdicionarPecaProtocoloModal(protocolo);
        
        utils.showToast(`Abrindo modal para adicionar peça ao protocolo ${protocolo}...`);
    }

    /**
     * Manipula o clique no botão "Excluir Linha".
     */
    function handleExcluirLinha(protocolo) {
        
        // Confirmar antes de excluir
        ui.showConfirmationModal(
            `Tem certeza que deseja excluir o protocolo "${protocolo}"? Esta ação não pode ser desfeita.`,
            () => {
                // Enviar comando para o backend excluir o protocolo
                vscode.postMessage({ 
                    command: 'deleteProtocolo', 
                    data: {
                        protocolo: protocolo,
                    }
                });
                
                // O toast e recarregamento da tabela serão feitos quando receber a resposta do backend
                // Isso é tratado no case 'pecaCargaOperationResult' ou 'pecasAfetadasNotification'
            }
        );
        
    }

    
    /**
     * Solicita todos os dados necessários do backend para popular a página.
     */
    let loadInitialDataTimeout;
    function loadInitialData() {
        const callTimestamp = new Date().toISOString();
        
        // Debounce para evitar chamadas muito frequentes
        if (loadInitialDataTimeout) {
            clearTimeout(loadInitialDataTimeout);
        }
        
        loadInitialDataTimeout = setTimeout(() => {
            const execTimestamp = new Date().toISOString();
            vscode.postMessage({ command: 'getDashboardData', source: 'loadControl' });
            vscode.postMessage({ command: 'getAllPecasAtivas', source: 'loadControl' });
            vscode.postMessage({ command: 'getProtocolosComStatus', source: 'loadControl' });
            
            // Aguardar um pouco e tentar renderizar tabelas se já temos dados
            setTimeout(() => {
                if (state.activePieces && state.activePieces.length > 0) {
                    renderActiveTables();
                }
            }, 500);
        }, 100); // Aguarda 100ms antes de executar
    }



    /**
     * Renderiza as tabelas de peças ativas com base nos filtros.
     */
    function renderActiveTables() {
    const containerF = document.getElementById('table-fronhas-container');
    const containerT = document.getElementById('table-toalhas-container');
    const containerL = document.getElementById('table-lencol-container');
    if (!containerF || !containerT || !containerL) return;

    // Normalização de texto para comparações robustas (removendo acentos e padronizando)
    const normalize = (str) => String(str || '')
        .toLowerCase()
        .replace(/[áàâã]/g, 'a')
        .replace(/[éê]/g, 'e')
        .replace(/[í]/g, 'i')
        .replace(/[óôõ]/g, 'o')
        .replace(/[ú]/g, 'u')
        .replace(/ç/g, 'c');

    const normalizeType = (type) => {
        const t = normalize(type);
        if (t.includes('fronha')) return 'fronha';
        if (t.includes('toalha')) return 'toalha';
        if (t.includes('lencol')) return 'lencol';
        return t;
    };

    const isActiveStatus = (status) => {
        const s = normalize(status);
        return s === 'ativa' || s === 'ativo' || s === 'active' || s === 'em uso';
    };

    const filterF = normalize(document.getElementById('filter-fronhas')?.value || '');
    const filterT = normalize(document.getElementById('filter-toalhas')?.value || '');
    const filterL = normalize(document.getElementById('filter-lencol')?.value || '');

    const mkTable = (items) => {
        let html = '<table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-800 sticky top-0"><tr>'+
            '<th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">TAG</th>'+
            '<th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Ciclos</th>'+
            '</tr></thead><tbody class="bg-white divide-y divide-gray-200 text-black">';
        items.forEach(p => {
            const cyclesClass = p.cycles >= 80 ? 'text-red-600 font-semibold' : '';
            html += `<tr><td class="px-4 py-2 text-sm">${p.tag_id}</td><td class="px-4 py-2 text-sm ${cyclesClass}">${p.cycles}</td></tr>`;
        });
        html += '</tbody></table>';
        return html;
    };

    const fronhas = state.activePieces.filter(p => {
        const type = normalizeType(p?.type);
        const statusOk = isActiveStatus(p?.status);
        const tagNorm = normalize((p?.tag_id || '').toString());
        return type === 'fronha' && statusOk && tagNorm.includes(filterF);
    });

    const toalhas = state.activePieces.filter(p => {
        const type = normalizeType(p?.type);
        const statusOk = isActiveStatus(p?.status);
        const tagNorm = normalize((p?.tag_id || '').toString());
        return type === 'toalha' && statusOk && tagNorm.includes(filterT);
    });

    const lencois = state.activePieces.filter(p => {
        const type = normalizeType(p?.type);
        const statusOk = isActiveStatus(p?.status);
        const tagNorm = normalize((p?.tag_id || '').toString());
        return type === 'lencol' && statusOk && tagNorm.includes(filterL);
    });

    containerF.innerHTML = mkTable(fronhas);
    containerT.innerHTML = mkTable(toalhas);
    containerL.innerHTML = mkTable(lencois);

}
/**
     * Verifica se todos os dados do refresh chegaram e, se sim, renderiza a UI.
     * Esta função é a chave para evitar a condição de corrida.
     */
    function checkAndRenderAfterRefresh() {
        // Se ainda não estamos aguardando todos os dados, não faz nada.
        if (pendingDataRefresh.charts || pendingDataRefresh.activePieces || pendingDataRefresh.protocols || pendingDataRefresh.availableCharts) {
            return;
        }

        // 3. Renderiza os componentes na ordem correta e segura
        // Primeiro as tabelas, que são mais simples.
        renderActiveTables();
        renderProcessosTable(); // Essa função deve ser a simplificada, sem "preserve/restore"
        
        // Por último, os gráficos, que dependem do <canvas> estar pronto no DOM.
        // Passamos os dados que já guardamos no 'state'.
        if (state.chartDistributionData) {
            renderers.renderPecasCargaCharts(state.chartDistributionData);
        }
        if (state.availableChartDistributionData) {
            renderers.renderAvailablePecasCharts(state.availableChartDistributionData);
        }
        
        // Reseta o objeto de controle para a próxima operação
        pendingDataRefresh = { charts: false, activePieces: false, protocols: false, availableCharts: false };
    }
    
    // Objeto para rastrear os dados pendentes durante um refresh completo
    let pendingDataRefresh = {
        charts: false,
        activePieces: false,
        protocols: false,
        availableCharts: false
    };

    /**
     * Renderiza a tabela de processos de carga.
     */
    function renderProcessosTable() {
        const tbody = document.getElementById('preparacao-carga-table-body');
        if (!tbody) return;

        const filterValue = document.getElementById('filter-prep-protocol')?.value.toLowerCase() || '';
        const filteredData = state.protocolsWithStatus.filter(p => 
            p.protocolo.toLowerCase().includes(filterValue)
        );
        
        document.getElementById('prep-filter-count').textContent = `${filteredData.length} encontrados`;

        if (filteredData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">Nenhum processo encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.map(p => {
            const isDesvinculado = p.vinculo_status === 'desvinculado';
            
            return `
            <tr>
                <td class="font-semibold">${p.protocolo}</td>
                <td>
                    <button class="text-blue-600 hover:underline" data-protocolo="${p.protocolo}" data-ciclo="frio">
                        Consultar
                    </button>
                </td>
                <td>
                    <button class="text-blue-600 hover:underline" data-protocolo="${p.protocolo}" data-ciclo="quente">
                        Consultar
                    </button>
                </td>
                <td class="flex items-center space-x-2">
                    ${!isDesvinculado ? `
                    <button class="hover:bg-blue-50 p-1 rounded text-blue-600" data-protocolo="${p.protocolo}" data-action="edit-protocol" title="Editar Nome do Protocolo">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <path d="M16 13l-4 4-4-4"></path>
                            <path d="M12 17l0-8"></path>
                            <path d="M17 12l-2 2-2-2"></path>
                            <path d="M13 14l-2-2 2-2"></path>
                        </svg>
                    </button>
                    <button class="hover:bg-green-50 p-1 rounded" data-protocolo="${p.protocolo}" data-action="add-piece" title="Adicionar Peça">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 5v14m-7-7h14"/>
                        </svg>
                    </button>
                    ` : ''}

                    <button class="hover:bg-red-50 p-1 rounded" data-protocolo="${p.protocolo}" data-action="delete-row" title="Excluir Protocolo">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                    
                    ${isDesvinculado ? '<span class="text-gray-400 text-xs ml-2 uppercase font-semibold tracking-wider">Finalizado</span>' : ''}
                </td>
            </tr>
            `;
        }).join('');
    }


// Funções de modal para controle de carga
const modalHandlers = {
        openPromoteColdToHotModal: (protocolo) => {
            const title = 'Promover Carga Fria para Quente';
            const contentHTML = `
                <form id="form-promote-cold-to-hot" class="space-y-4 p-4 text-black">
                    <p class="text-sm text-gray-700">
                        Esta ação irá dar baixa no ciclo frio do protocolo <strong class="text-blue-600">${protocolo}</strong> 
                        e, em seguida, cadastrar as mesmas peças no ciclo quente.
                    </p>
                    
                    <div>
                        <label for="promote-cycles-to-add" class="block text-sm font-medium text-gray-700">Ciclos a adicionar (pelo ciclo frio):</label>
                        <input type="number" id="promote-cycles-to-add" name="cycles_to_add" value="1" min="0" required class="w-full p-2 border rounded text-black mt-1">
                    </div>

                    <div class="bg-yellow-50 border border-yellow-200 rounded-md p-4 mt-4">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                </svg>
                            </div>
                            <div class="ml-3">
                                <p class="text-sm text-yellow-700">
                                    Peças que atingirem 80 ciclos ou mais com esta adição serão <strong>inativadas</strong> e não serão promovidas para o ciclo quente.
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex justify-end pt-4">
                        <button type="submit" class="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded">
                            Confirmar e Promover
                        </button>
                    </div>
                </form>
            `;

            utils.openModal(title, contentHTML, () => {
                document.getElementById('form-promote-cold-to-hot').addEventListener('submit', (e) => {
                    e.preventDefault();
                    const cyclesToAdd = parseInt(document.getElementById('promote-cycles-to-add').value, 10);
                    
                    if (isNaN(cyclesToAdd)) {
                        utils.showToast("Número de ciclos inválido.", true);
                        return;
                    }

                    // Envia o novo comando para o backend
                    vscode.postMessage({ 
                        command: 'promoteColdToHot', 
                        data: { 
                            protocolo: protocolo,
                            cycles_to_add: cyclesToAdd
                        } 
                    });
                    
                    utils.closeModal();
                    utils.showToast('Processando promoção de carga...', false, 2000);
                });
            });
        },

        openEditProtocolModal: (protocoloAtual) => {
            const title = 'Editar Protocolo';
            const contentHTML = `
                <form id="form-edit-protocol" class="space-y-4 p-4 text-black">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Protocolo Atual</label>
                        <input type="text" value="${protocoloAtual}" disabled class="w-full p-2 border rounded bg-gray-100 text-gray-500 mt-1">
                    </div>
                    <div>
                        <label for="new-protocol-name" class="block text-sm font-medium text-gray-700">Novo Protocolo</label>
                        <input type="text" id="new-protocol-name" name="new_protocol" required class="w-full p-2 border rounded text-black mt-1" placeholder="Digite o novo nome">
                    </div>
                    <div class="flex justify-end pt-4">
                        <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded">
                            Salvar Alterações
                        </button>
                    </div>
                </form>
            `;

            utils.openModal(title, contentHTML, () => {
                document.getElementById('new-protocol-name').focus();
                document.getElementById('form-edit-protocol').addEventListener('submit', (e) => {
                    e.preventDefault();
                    const newName = document.getElementById('new-protocol-name').value.trim();
                    if (!newName) return;
                    
                    if (newName === protocoloAtual) {
                        utils.closeModal();
                        return;
                    }

                    vscode.postMessage({ 
                        command: 'updateProtocoloName', 
                        data: { oldName: protocoloAtual, newName: newName } 
                    });
                    utils.closeModal();
                    utils.showToast('Atualizando protocolo...', false, 2000);
                });
            });
        },

        // Abre o modal de cadastro de novo protocolo de carga
        openCadastrarProtocoloModal: () => {
            if (!authSystem.hasAccess()) {
                alert('Acesso negado. Apenas técnicos e administradores podem realizar esta ação.');
                return;
            }
            const title = 'Cadastrar Protocolo de Carga';
            // Buscar peças sem vínculo ativo para o dropdown
            vscode.postMessage({ command: 'getPecasSemVinculoAtivo' });

            // Abre o modal com o conteúdo carregando
            utils.openModal(title, '<div id="pecas-list-container" class="p-4">Carregando peças sem vínculo ativo...</div>', () => {});
        },

        // Abre o modal de consulta de protocolo de carga
        openConsultarProtocoloModal: (preselectedProtocol = null) => {
            const title = 'Consultar Protocolo de Carga';
            // Armazena protocolo para pré-seleção no render do modal
            state.modalPreselect = { tipo: 'consultar', protocolo: preselectedProtocol };
            // Buscar apenas protocolos ativos
            vscode.postMessage({ command: 'getActiveProtocolosCarga', source: 'loadControl' });
            const content = `
                <div id="protocolo-details-container" class="p-4 text-black">Carregando protocolos...</div>`;
            utils.openModal(title, content, () => {});
        },

        // Modal para visualizar peças vinculadas por protocolo e ciclo
         openVisualizarCargaModal: (protocolo, tipoCiclo) => {
        const title = `Peças do Protocolo ${protocolo} (${tipoCiclo === 'frio' ? 'Frio' : 'Quente'})`;
        const content = `
            <div class="p-4 text-black">
                <div id="carga-summary" class="mb-3 text-sm font-medium"></div>
                <div id="view-carga-container">Carregando peças vinculadas...</div>
            </div>`;
        utils.openModal(title, content, () => {
            vscode.postMessage({ command: 'getProtocoloCargaDetails', data: { protocolo, tipoCiclo } });
        });
    },

        // Abre o modal de descadastro de protocolo de carga
        openDescadastrarProtocoloModal: (preselectedProtocol = null) => {
            if (!authSystem.hasAccess()) {
                alert('Acesso negado. Apenas técnicos e administradores podem realizar esta ação.');
                return;
            }
            const title = 'Descadastrar Protocolo de Carga';
            // Armazena protocolo para pré-seleção no render do modal
            state.modalPreselect = { tipo: 'descadastrar', protocolo: preselectedProtocol };
            vscode.postMessage({ command: 'getActiveProtocolosCarga', source: 'loadControl' });
            utils.openModal(title, '<div id="descadastrar-protocolo-container" class="p-4 text-black">Carregando protocolos...</div>', () => {});
        },



        // Modal para adicionar peça(s) a um protocolo existente
        openAdicionarPecaProtocoloModal: (protocolo) => {
            if (!authSystem.hasAccess()) {
                alert('Acesso negado. Apenas técnicos e administradores podem realizar esta ação.');
                return;
            }
            const title = 'Adicionar Peça ao Protocolo';
            // Guarda protocolo para uso no submit
            state.modalPreselect = { tipo: 'add-piece', protocolo };
            // Solicita peças ativas
            vscode.postMessage({ command: 'getPecasSemVinculoAtivo'});
            // Abre modal com container placeholder
            utils.openModal(title, '<div id="add-piece-container" class="p-4 text-black">Carregando peças ativas...</div>', () => {});
        },

        // Abre o modal de consulta de peça de carga
        openConsultarPecaModal: () => {
            const title = 'Consultar Peça de Carga';
            const contentHTML = `
                <form id="form-consultar-peca" class="space-y-4 p-4 text-black">
                    <div>
                        <label for="consultar-peca-type" class="block text-sm font-medium text-gray-700">Tipo de Peça</label>
                        <select id="consultar-peca-type" name="type" required class="w-full p-2 border rounded text-black mt-1">
                            <option value="">Selecione o tipo</option>
                            <option value="fronhas">Fronha</option>
                            <option value="toalhas">Toalha de Rosto</option>
                            <option value="lencol">Lençol</option>
                        </select>
                    </div>
                    <div>
                        <label for="consultar-peca-tag-suffix" class="block text-sm font-medium text-gray-700">TAG da Peça</label>
                        <div class="peca-code-group mt-1">
                            <span id="consultar-peca-tag-prefix" class="prefix-display"></span>
                            <input type="text" id="consultar-peca-tag-suffix" name="tag_suffix" placeholder="001" required class="flex-1 p-2 border rounded peca-code-input text-black">
                        </div>
                    </div>
                    <button type="submit" class="w-full bg-blue-500 text-white p-2 rounded">Consultar</button>
                </form>
                <div id="peca-details-result" class="mt-4 p-4 border-t"></div>
            `;
            utils.openModal(title, contentHTML, () => {
                const form = document.getElementById('form-consultar-peca');
                const pecaTypeSelect = document.getElementById('consultar-peca-type');
                const pecaTagPrefixSpan = document.getElementById('consultar-peca-tag-prefix');
                const pecaTagSuffixInput = document.getElementById('consultar-peca-tag-suffix');

                const updateTagPrefix = () => {
                    let prefix = '';
                    switch (pecaTypeSelect.value) {
                        case 'fronhas': prefix = 'WFK T 13.'; break;
                        case 'toalhas': prefix = 'WFK T 12.'; break;
                        case 'lencol': prefix = 'WFK T 11.'; break;
                    }
                    pecaTagPrefixSpan.textContent = prefix;
                };
                
                pecaTypeSelect.addEventListener('change', updateTagPrefix);
                
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const fullTagId = pecaTagPrefixSpan.textContent + pecaTagSuffixInput.value;
                    vscode.postMessage({ command: 'getPecaDetails', tag_id: fullTagId });
                });
                
                // Inicializa o prefixo
                updateTagPrefix();
            });
        },

        // Abre o modal de visualização de peças vencidas
        openPecasInativasModal: () => {
            const title = 'Peças Vencidas';
            const contentHTML = `
                <div id="pecas-inativas-container" class="space-y-4 p-4">
                    <div class="flex flex-wrap gap-4 mb-4">
                        <div class="flex-1 min-w-48">
                            <label for="filter-type-inativas" class="block text-sm font-medium text-gray-700">Tipo</label>
                            <select id="filter-type-inativas" class="w-full p-2 border rounded text-black mt-1">
                                <option value="">Todos os tipos</option>
                                <option value="fronhas">Fronha</option>
                                <option value="toalhas">Toalha de Rosto</option>
                                <option value="lencol">Lençol</option>
                            </select>
                        </div>
                        <div class="flex-1 min-w-48">
                            <label for="filter-tag-inativas" class="block text-sm font-medium text-gray-700">TAG</label>
                            <input type="text" id="filter-tag-inativas" placeholder="Filtrar por TAG..." class="w-full p-2 border rounded text-black mt-1">
                        </div>
                    </div>
                    
                    <!-- Seção de exclusão em massa -->
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                        <h4 class="text-red-800 font-semibold mb-2">Exclusão em Massa por Ano</h4>
                        <div class="flex flex-wrap gap-4 items-end">
                            <div class="flex-1 min-w-48">
                                <label for="bulk-delete-year" class="block text-sm font-medium text-red-700">Ano que ficaram inativas</label>
                                <select id="bulk-delete-year" class="w-full p-2 border border-red-300 rounded text-black mt-1">
                                    <option value="">Selecione um ano</option>
                                </select>
                            </div>
                            <div>
                                <button id="btn-bulk-delete-inactive" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                                    Excluir Peças do Ano
                                </button>
                            </div>
                        </div>
                        <p class="text-sm text-red-600 mt-2">⚠️ Esta ação é irreversível. Todas as peças que ficaram inativas no ano selecionado serão excluídas permanentemente.</p>
                    </div>
                    
                    <div id="pecas-inativas-list" class="min-h-64">
                        <div class="flex justify-center items-center h-32">
                            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                            <span class="ml-2 text-gray-600">Carregando peças vencidas...</span>
                        </div>
                    </div>
                </div>
            `;
            
            utils.openModal(title, contentHTML, () => {
                // Carregar dados iniciais sem filtros
                vscode.postMessage({ 
                    command: 'getAllPecasVencidas',
                    filters: {
                        type: '',
                        tag: ''
                    }
                });
             });
         },

        // Abre o modal de marcação de peça como danificada
        openPecaDanificadaModal: () => {
            if (!authSystem.hasAccess()) {
                alert('Acesso negado. Apenas técnicos e administradores podem realizar esta ação.');
                return;
            }
            const title = 'Marcar Peça como Danificada';
            
            // 1. Solicita a lista de todas as peças ativas ao backend.
            vscode.postMessage({ command: 'getAllPecasAtivas', source: 'loadControl' });

            // 2. Abre o modal com um placeholder de carregamento.
            // O conteúdo real será inserido quando a resposta do backend chegar.
            const contentHTML = `
                <div id="peca-danificada-container" class="p-4 text-black min-h-96">
                    <div class="flex justify-center items-center h-full">
                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        <span class="ml-3 text-gray-600">Carregando peças ativas...</span>
                    </div>
                </div>
            `;
            
            utils.openModal(title, contentHTML);
        },

        // Abre o modal de cadastro de nova peça de carga
        openCadastrarCargaNovaModal: () => {
            if (!authSystem.hasAccess()) {
                alert('Acesso negado. Apenas técnicos e administradores podem realizar esta ação.');
                return;
            }
            const title = 'Cadastrar Novas Peças de Carga';
            const contentHTML = `
                <div class="space-y-4">
                    <!-- Seleção do tipo de peça -->
                    <div>
                        <label for="peca-type" class="block text-sm font-medium text-gray-700">Tipo de Peça</label>
                        <select id="peca-type" name="type" required class="w-full p-2 border rounded text-black mt-1">
                            <option value="">Selecione o tipo</option>
                            <option value="fronhas">Fronha</option>
                            <option value="toalhas">Toalha de Rosto</option>
                            <option value="lencol">Lençol</option>
                        </select>
                    </div>
                    
                    <!-- Campo para adicionar peças -->
                    <div>
                        <label for="peca-tag-suffix" class="block text-sm font-medium text-gray-700">Número da Peça</label>
                        <div class="flex gap-2 mt-1">
                            <div class="peca-code-group flex-1">
                                <span id="peca-tag-prefix" class="prefix-display"></span>
                                <input type="text" id="peca-tag-suffix" name="tag_suffix" placeholder="001" class="flex-1 p-2 border rounded peca-code-input text-black">
                                <button type="button" id="btn-adicionar-peca" class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                                    Adicionar
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Lista de peças adicionadas -->
                    <div id="pecas-adicionadas-container" class="hidden">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Peças a serem cadastradas:</label>
                        <div class="border rounded p-3 bg-gray-50 max-h-60 overflow-y-auto">
                            <ul id="pecas-adicionadas-lista" class="space-y-2">
                                <!-- Peças serão adicionadas aqui dinamicamente -->
                            </ul>
                        </div>
                    </div>
                    
                    <!-- Botões de ação -->
                    <div class="flex justify-end space-x-2 pt-4 border-t">
                        <button type="button" onclick="utils.closeModal()" class="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400">
                            Cancelar
                        </button>
                        <button type="button" id="btn-salvar-pecas" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                            Salvar Peças
                        </button>
                    </div>
                </div>
            `;
            utils.openModal(title, contentHTML, () => {
                const pecaTypeSelect = document.getElementById('peca-type');
                const pecaTagPrefixSpan = document.getElementById('peca-tag-prefix');
                const pecaTagSuffixInput = document.getElementById('peca-tag-suffix');
                const btnAdicionarPeca = document.getElementById('btn-adicionar-peca');
                const btnSalvarPecas = document.getElementById('btn-salvar-pecas');
                const pecasAdicionadasContainer = document.getElementById('pecas-adicionadas-container');
                const pecasAdicionadasLista = document.getElementById('pecas-adicionadas-lista');
                
                // Array para armazenar as peças adicionadas
               pecasParaCadastrar = [];

                const updateTagPrefix = () => {
                    let prefix = '';
                    switch (pecaTypeSelect.value) {
                        case 'fronhas': prefix = 'WFK T 13.'; break;
                        case 'toalhas': prefix = 'WFK T 12.'; break;
                        case 'lencol': prefix = 'WFK T 11.'; break;
                    }
                    pecaTagPrefixSpan.textContent = prefix;
                    
                    // Habilita/desabilita o botão adicionar baseado na seleção do tipo
                    updateAdicionarButton();
                };

                const updateAdicionarButton = () => {
                    const hasType = pecaTypeSelect.value !== '';
                    const hasNumber = pecaTagSuffixInput.value.trim() !== '';
                    btnAdicionarPeca.disabled = !(hasType && hasNumber);
                };

                const updateSalvarButton = () => {
                    btnSalvarPecas.disabled = pecasParaCadastrar.length === 0;
                };

                const renderPecasLista = () => {
                    pecasAdicionadasLista.innerHTML = '';
                    
                    pecasParaCadastrar.forEach((peca, index) => {
                        const li = document.createElement('li');
                        const isExisting = peca.isExisting;
                        
                        // Aplica classes diferentes baseado se a peça já existe
                        li.className = `flex justify-between items-center p-2 rounded border ${
                            isExisting 
                                ? 'bg-red-50 border-red-300' 
                                : 'bg-white border-gray-300'
                        }`;
                        
                        li.innerHTML = `
                            <div class="flex-1">
                                <span class="font-medium ${isExisting ? 'text-red-700' : 'text-gray-800'}">${peca.tag_id}</span>
                                <span class="text-sm ${isExisting ? 'text-red-600' : 'text-gray-600'} ml-2">(${peca.type})</span>
                                ${isExisting ? '<div class="text-xs text-red-600 mt-1">⚠️ Peça já cadastrada no banco de dados</div>' : ''}
                            </div>
                            <button type="button" class="btn-remover-peca px-2 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600" data-index="${index}">
                                Remover
                            </button>
                        `;
                        pecasAdicionadasLista.appendChild(li);
                    });

                    // Adiciona event listeners para os botões de remover
                    document.querySelectorAll('.btn-remover-peca').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const index = parseInt(e.target.dataset.index);
                            pecasParaCadastrar.splice(index, 1);
                            renderPecasLista();
                            updateSalvarButton();
                            
                            // Esconde o container se não há mais peças
                            if (pecasParaCadastrar.length === 0) {
                                pecasAdicionadasContainer.classList.add('hidden');
                            }
                        });
                    });
                };

                const adicionarPeca = async () => {
                    const suffix = pecaTagSuffixInput.value.trim();
                    const fullTagId = pecaTagPrefixSpan.textContent + suffix;
                    
                    // Verifica se a peça já foi adicionada na lista atual
                    if (pecasParaCadastrar.some(p => p.tag_id === fullTagId)) {
                        utils.showToast('Esta peça já foi adicionada à lista.', true);
                        return;
                    }
                    
                    // Armazenar dados da peça temporariamente para usar após verificação
                    window.tempPecaData = {
                        tag_id: fullTagId,
                        type: pecaTypeSelect.value,
                        acquisition_date: new Date().toISOString().split('T')[0]
                    };
                    
                    // Verificar se a peça já existe no banco de dados
                    vscode.postMessage({ 
                        command: 'checkPecaExists', 
                        data: { tag_id: fullTagId } 
                    });
                    
                    // Limpa o campo de entrada imediatamente para melhor UX
                    pecaTagSuffixInput.value = '';
                    updateAdicionarButton();
                    
                    // Foca no campo de entrada para facilitar a adição da próxima peça
                    pecaTagSuffixInput.focus();
                };

                const salvarTodasPecas = () => {
                    if (pecasParaCadastrar.length === 0) {
                        utils.showToast('Adicione pelo menos uma peça antes de salvar.', true);
                        return;
                    }
                    
                    // Filtrar peças que não existem no banco de dados
                    const pecasNovas = pecasParaCadastrar.filter(peca => !peca.isExisting);
                    const pecasExistentes = pecasParaCadastrar.filter(peca => peca.isExisting);
                    
                    if (pecasNovas.length === 0) {
                        utils.showToast('Todas as peças da lista já estão cadastradas no banco de dados.', true);
                        return;
                    }
                    
                    // Se há peças existentes, avisar o usuário
                    if (pecasExistentes.length > 0) {
                        const existingTags = pecasExistentes.map(p => p.tag_id).join(', ');
                        utils.showToast(`As seguintes peças já existem e não serão cadastradas: ${existingTags}`, false, 5000);
                    }
                    
                    // Envia apenas as peças novas para o backend
                    vscode.postMessage({ command: 'addPecaCarga', data: pecasNovas });
                    
                    // Limpa a lista e fecha o modal
                    pecasParaCadastrar.length = 0;
                    utils.closeModal();
                };

                // Event listeners
                pecaTypeSelect.addEventListener('change', updateTagPrefix);
                pecaTagSuffixInput.addEventListener('input', updateAdicionarButton);
                
                // Permite adicionar peça pressionando Enter no campo de entrada
                pecaTagSuffixInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !btnAdicionarPeca.disabled) {
                        e.preventDefault();
                        adicionarPeca();
                    }
                });
                
                btnAdicionarPeca.addEventListener('click', adicionarPeca);
                btnSalvarPecas.addEventListener('click', salvarTodasPecas);

                // Inicialização
                updateTagPrefix();
            });
        },

        // Abre o modal para descadastrar protocolo (função adicional)
        openDeleteProtocolModal: () => {
            // Primeiro solicitar protocolos ativos
            vscode.postMessage({ command: 'getActiveProtocolosCarga' });

            const modalContent = `
                <div class="space-y-4">
                    <h3 class="text-lg font-bold text-gray-800">Descadastrar Protocolo</h3>
                    <div class="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                </svg>
                            </div>
                            <div class="ml-3">
                                <h3 class="text-sm font-medium text-red-800">Atenção</h3>
                                <div class="mt-2 text-sm text-red-700">
                                    <p>Esta ação irá remover permanentemente o protocolo e desvincular todas as peças associadas.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <form id="form-delete-protocol" class="space-y-4">
                        <div>
                            <label for="protocol-delete-select" class="block text-sm font-medium text-gray-700">Selecione o Protocolo</label>
                            <select id="protocol-delete-select" name="protocolo" required 
                                    class="mt-1 block w-full p-2 border rounded-md text-black">
                                <option value="">Carregando protocolos...</option>
                            </select>
                        </div>
                        <div class="flex justify-end space-x-2 pt-4 border-t">
                            <button type="button" onclick="utils.closeModal()" 
                                    class="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400">
                                Cancelar
                            </button>
                            <button type="submit" 
                                    class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
                                Descadastrar
                            </button>
                        </div>
                    </form>
                </div>
            `;

            utils.openModal('Descadastrar Protocolo', modalContent);

            // Carregar protocolos no select
            setTimeout(() => {
                const select = document.getElementById('protocol-delete-select');
                if (select && state.activeProtocols) {
                    select.innerHTML = '<option value="">Selecione um protocolo</option>';
                    state.activeProtocols.forEach(protocolo => {
                        const option = document.createElement('option');
                        option.value = protocolo;
                        option.textContent = protocolo;
                        select.appendChild(option);
                    });
                }
            }, 1000);

            // Adicionar event listener para o formulário
            setTimeout(() => {
                const form = document.getElementById('form-delete-protocol');
                if (form) {
                    form.addEventListener('submit', (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.target);
                        const protocolo = formData.get('protocolo');

                        if (!protocolo) {
                            utils.showToast('Selecione um protocolo para descadastrar.', true);
                            return;
                        }

                        // Confirmar ação
                        ui.showConfirmationModal(
                            `Tem certeza que deseja descadastrar o protocolo "${protocolo}"? Esta ação não pode ser desfeita.`,
                            () => {
                                // Enviar para o backend
                                vscode.postMessage({ 
                                    command: 'deleteProtocoloCarga', 
                                    data: { 
                                        protocolo,
                                        cycles_to_add: 0,
                                        tipo_ciclo: 'frio'
                                    } 
                                });

                                utils.closeModal();
                                utils.showToast('Protocolo descadastrado com sucesso!');
                                
                                // Recarregar dados
                                setTimeout(() => {
                                    loadInitialData();
                                }, 500);
                            }
                        );
                    });
                }
            }, 100);
        }
    };

// Funções adicionais de modal (compatibilidade com main.js)
window.openAddProtocolModal = function openAddProtocolModal() {
    // Primeiro solicitar peças ativas
    if (typeof vscode !== 'undefined') {
        vscode.postMessage({ command: 'getAllPecasAtivas' });
    }

    const modalContent = `
        <div class="space-y-4">
            <h3 class="text-lg font-bold text-gray-800">Cadastrar Protocolo</h3>
            <div id="pecas-list-container">
                <div class="text-center py-4">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p class="mt-2 text-gray-600">Carregando peças...</p>
                </div>
            </div>
        </div>
    `;

    utils.openModal('Cadastrar Protocolo', modalContent);
}

/**
 * Abre modal para marcar peça como danificada
 */
window.openMarkDamagedModal = function openMarkDamagedModal() {
    // Primeiro solicitar peças ativas
    if (typeof vscode !== 'undefined') {
        vscode.postMessage({ command: 'getAllPecasAtivas' });
    }

    const modalContent = `
        <div class="space-y-4">
            <h3 class="text-lg font-bold text-gray-800">Marcar Peça como Danificada</h3>
            <div id="peca-danificada-container">
                <div class="text-center py-4">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto"></div>
                    <p class="mt-2 text-gray-600">Carregando peças...</p>
                </div>
            </div>
        </div>
    `;

    utils.openModal('Peça Danificada', modalContent);
}

/**
 * Mostra peças inativas
 */
function showInactivePieces() {
    // Solicitar peças vencidas
    if (typeof vscode !== 'undefined') {
        vscode.postMessage({ command: 'getAllPecasVencidas' });
    }

    const modalContent = `
        <div class="space-y-4">
            <h3 class="text-lg font-bold text-gray-800">Peças Inativas</h3>
            <div id="stats-text" class="text-sm text-gray-600"></div>
            <div id="pecas-inativas-list">
                <div class="text-center py-4">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500 mx-auto"></div>
                    <p class="mt-2 text-gray-600">Carregando peças inativas...</p>
                </div>
            </div>
        </div>
    `;

    utils.openModal('Peças Inativas', modalContent);
}

/**
 * Abre modal para consultar protocolo
 */
function openConsultProtocolModal() {
    // Primeiro solicitar protocolos ativos
    if (typeof vscode !== 'undefined') {
        vscode.postMessage({ command: 'getActiveProtocolosCarga' });
    }

    const modalContent = `
        <div class="space-y-4">
            <h3 class="text-lg font-bold text-gray-800">Consultar Protocolo</h3>
            <div id="protocolo-details-container">
                <div class="text-center py-4">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto"></div>
                    <p class="mt-2 text-gray-600">Carregando protocolos...</p>
                </div>
            </div>
        </div>
    `;

    utils.openModal('Consultar Protocolo', modalContent);
}

// Funções de renderização de página
const renderers = {
    renderPreparacaoCargaPage: () => {
        // Preserva valor do filtro no campo
        const input = document.getElementById('filter-prep-protocol');
        if (input) input.value = state.filters?.prepProtocol || '';
        // Liga listener de filtro (idempotente) para re-renderizar conforme digitação
        if (input && !input.dataset.wired) {
            input.addEventListener('input', () => {
                state.filters = state.filters || {};
                state.filters.prepProtocol = input.value || '';
                // Solicita dados novamente para aplicar filtro na renderização
                vscode.postMessage({ command: 'getProtocolosComStatus', source: 'loadControl' });
            });
            input.dataset.wired = 'true';
        }
        // Solicita lista de protocolos e re-renderiza a tabela com base no filtro
        vscode.postMessage({ command: 'getProtocolosComStatus', source: 'loadControl' });
    },

    renderControleCargaPage : () => {
        // Solicita os dados para os gráficos ao backend
        vscode.postMessage({ command: 'getPecasCycleDistribution', source: 'loadControl' });
        // Buscar apenas peças ativas para popular as tabelas
        vscode.postMessage({ command: 'getAllPecasAtivas', source: 'loadControl' });
        
        // Se já temos dados de peças ativas, renderizar as tabelas imediatamente
        if (state.activePieces && state.activePieces.length > 0) {
            setTimeout(() => renderActiveTables(), 100);
        }
        // Inicializa listeners de filtro (idempotente)
        const filterFronhas = document.getElementById('filter-fronhas');
        const filterToalhas = document.getElementById('filter-toalhas');
        const filterLencol = document.getElementById('filter-lencol');
        filterFronhas && !filterFronhas.dataset.wired && (filterFronhas.addEventListener('input', () => renderActiveTables()), filterFronhas.dataset.wired = 'true');
        filterToalhas && !filterToalhas.dataset.wired && (filterToalhas.addEventListener('input', () => renderActiveTables()), filterToalhas.dataset.wired = 'true');
        filterLencol && !filterLencol.dataset.wired && (filterLencol.addEventListener('input', () => renderActiveTables()), filterLencol.dataset.wired = 'true');

        // Se existir estrutura de abas, prepara listeners idempotentes
        const tabDash = document.getElementById('tab-controle-dashboard');
        const tabProc = document.getElementById('tab-controle-processos');
        const panelDash = document.getElementById('controle-dashboard-panel');
        const panelProc = document.getElementById('controle-processos-panel');
        if (tabDash && tabProc && panelDash && panelProc) {
            const activateDash = () => {
                tabDash.classList.add('active');
                tabProc.classList.remove('active');
                panelDash.classList.remove('hidden');
                panelProc.classList.add('hidden');
                
                // Recarrega os gráficos quando o dashboard é ativado para garantir que estejam visíveis
                setTimeout(() => {
                    // Para o monitoramento anterior se existir
                    if (window.chartMonitorInterval) {
                        clearInterval(window.chartMonitorInterval);
                        window.chartMonitorInterval = null;
                    }
                    // Solicita novos dados dos gráficos de peças ativas
                    vscode.postMessage({ command: 'getPecasCycleDistribution', source: 'dashboardActivation' });
                    // Solicita novos dados dos gráficos de peças disponíveis
                    vscode.postMessage({ command: 'getAvailablePecasCycleDistribution', source: 'dashboardActivation' });
                }, 150); // Delay para garantir que o painel esteja visível
            };
            const activateProc = () => {
                tabProc.classList.add('active');
                tabDash.classList.remove('active');
                panelProc.classList.remove('hidden');
                panelDash.classList.add('hidden');
                // Ao ativar a aba Processos, buscar protocolos e aplicar filtro
                renderers.renderPreparacaoCargaPage();
                // Renderiza protocolos com status por filtro atual
                vscode.postMessage({ command: 'getProtocolosComStatus', source: 'loadControl' });
            };
            if (!tabDash.dataset.wired) {
                tabDash.addEventListener('click', (e) => { e.preventDefault(); activateDash(); });
                tabDash.dataset.wired = 'true';
            }
            if (!tabProc.dataset.wired) {
                tabProc.addEventListener('click', (e) => { e.preventDefault(); activateProc(); });
                tabProc.dataset.wired = 'true';
            }
            // Padrão: mostrar Dashboard
            if (!tabDash.classList.contains('active') && !tabProc.classList.contains('active')) {
                activateDash();
            }
        }
    },
    renderPecasCargaCharts: (data) => {
    console.log('Dados recebidos para renderização dos gráficos:', data);
    if (!data || (!data.active && !data.available)) {
        console.log('Dados inválidos ou ausentes para renderização');
        return;
    }

    // Garantir que os dados estão no formato correto
    const validateChartData = (chartData) => {
        if (!Array.isArray(chartData)) return false;
        return chartData.every(item => 
            item && 
            typeof item === 'object' && 
            typeof item.type === 'string' &&
            typeof item.range1 === 'number' &&
            typeof item.range2 === 'number' &&
            typeof item.range3 === 'number' &&
            typeof item.range4 === 'number'
        );
    };

    // Função auxiliar para renderizar um conjunto de 3 gráficos
    const renderChartSet = (distributionData, suffix, colorScheme) => {
        if (!distributionData) return;
        
        const types = ['fronhas', 'toalhas', 'lencol'];
        types.forEach(type => {
            const canvasId = `chart-${type}${suffix}`; // Ex: chart-fronhas ou chart-fronhas-avail
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;

            const typeData = distributionData.find(d => d.type === type);
            const chartData = typeData && typeof typeData.range1 === 'number' ? 
                [typeData.range1, typeData.range2, typeData.range3, typeData.range4] : [0,0,0,0];
            
            // Usar as mesmas cores para ambos os gráficos (ativos e disponíveis)
            const bgColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']; // Cores padrão para todos os gráficos

            renderers.createOrUpdateChart(canvasId, 'bar', {
                labels: ['0-19', '20-39', '40-59', '60-79'],
                datasets: [{
                    label: 'Qtd',
                    data: chartData,
                    backgroundColor: bgColors
                }]
            }, {
                 plugins: { 
                    legend: { display: false },
                    datalabels: {
                        display: true, // Habilitar rótulos de dados
                        color: '#fff', // Cor branca para os números
                        font: { weight: 'bold', size: 12 },
                        anchor: 'center', // Centralizar o rótulo
                        align: 'center' // Alinhar ao centro da coluna
                    }
                },
                scales: { y: { ticks: { stepSize: 1 }, grid: { display: false } } },
                animation: { duration: 0 }, // Performance
                maintainAspectRatio: false
            });
        });
    };

    // Renderiza os dois conjuntos
    // Sufixo vazio '' para os gráficos originais (Ativos Total)
    if (validateChartData(data.active)) {
        console.log('Renderizando gráficos de peças ativas:', data.active);
        renderChartSet(data.active, '', 'default');
    } else {
        console.warn('Dados de peças ativas inválidos:', data.active);
    }
    
    // Sufixo '-avail' para os novos gráficos (Disponíveis)
    if (validateChartData(data.available)) {
        console.log('Renderizando gráficos de peças disponíveis:', data.available);
        renderChartSet(data.available, '-avail', 'green');
    } else {
        console.warn('Dados de peças disponíveis inválidos:', data.available);
    }
},

    // Função de debug para forçar criação dos gráficos
    forceCreateCharts: () => {
        
        // Reset das flags
        window.isRenderingCharts = false;
        window.isUpdatingCharts = false;
                
        if (state.chartDistributionData) {
            renderers.renderPecasCargaCharts(state.chartDistributionData);
        }
    },

    renderAvailablePecasCharts: (data) => {
        console.log('Dados recebidos para renderização dos gráficos de peças disponíveis:', data);
        if (!data || !Array.isArray(data)) {
            console.log('Dados inválidos ou ausentes para renderização de peças disponíveis');
            return;
        }

        // Valida os dados
        const validateChartData = (chartData) => {
            if (!Array.isArray(chartData)) return false;
            return chartData.every(item => 
                item && 
                typeof item === 'object' && 
                typeof item.type === 'string' &&
                typeof item.range1 === 'number' &&
                typeof item.range2 === 'number' &&
                typeof item.range3 === 'number' &&
                typeof item.range4 === 'number'
            );
        };

        if (!validateChartData(data)) {
            console.warn('Dados de peças disponíveis inválidos:', data);
            return;
        }

        // Inicializa window.availableCharts se não existir
        if (!window.availableCharts) {
            window.availableCharts = {};
        }

        // Renderiza os gráficos de peças disponíveis
        const types = ['fronhas', 'toalhas', 'lencol'];
        types.forEach(type => {
            const canvasId = `chart-${type}-avail`;
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;

            const typeData = data.find(d => d.type === type);
            const chartData = typeData && typeof typeData.range1 === 'number' ? 
                [typeData.range1, typeData.range2, typeData.range3, typeData.range4] : [0,0,0,0];
            
            // Usa as mesmas cores dos gráficos de peças ativas
            const bgColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

            renderers.createOrUpdateChart(canvasId, 'bar', {
                labels: ['0-19', '20-39', '40-59', '60-79'],
                datasets: [{
                    label: 'Qtd',
                    data: chartData,
                    backgroundColor: bgColors
                }]
            }, {
                plugins: { 
                    legend: { display: false },
                    datalabels: {
                        display: true,
                        color: '#fff',
                        font: { weight: 'bold', size: 12 },
                        anchor: 'center',
                        align: 'center'
                    }
                },
                scales: { y: { ticks: { stepSize: 1 }, grid: { display: false } } },
                animation: { duration: 0 },
                maintainAspectRatio: false
            });
        });

        console.log('Gráficos de peças disponíveis renderizados com sucesso');
    },

     createOrUpdateChart: (canvasId, type, data, options) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            return;
        }

        const ctx = canvas.getContext('2d');

        if (!window.charts) window.charts = {};

        if (window.charts[canvasId]) {
            // Atualiza em vez de destruir
            window.charts[canvasId].data = data;
            window.charts[canvasId].update();
            return;
        }

        const defaultOptions = {
            responsive: true,
            maintainAspectRatio: false,
            aspectRatio: 1.8,
            layout: {
                padding: { top: 10, bottom: 10, left: 10, right: 10 }
            }
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options,
            layout: { ...defaultOptions.layout, ...(options?.layout || {}) }
        };

        window.charts[canvasId] = new Chart(ctx, {
            type,
            data,
            options: mergedOptions
        });
    },

    createOrUpdateAvailableChart: (canvasId, type, data, options) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            return;
        }

        const ctx = canvas.getContext('2d');

        if (!window.availableCharts) window.availableCharts = {};

        if (window.availableCharts[canvasId]) {
            // Atualiza em vez de destruir
            window.availableCharts[canvasId].data = data;
            window.availableCharts[canvasId].update();
            return;
        }

        const defaultOptions = {
            responsive: true,
            maintainAspectRatio: false,
            aspectRatio: 1.8,
            layout: {
                padding: { top: 10, bottom: 10, left: 10, right: 10 }
            }
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options,
            layout: { ...defaultOptions.layout, ...(options?.layout || {}) }
        };

        window.availableCharts[canvasId] = new Chart(ctx, {
            type,
            data,
            options: mergedOptions
        });
    },

    renderProtocolosTable: (data) => {
    const tbody = document.getElementById('preparacao-carga-table-body');
    const filterEl = document.getElementById('filter-prep-protocol');
    const countEl = document.getElementById('prep-filter-count');
    if (!tbody || !data) return;

    const list = Array.isArray(data) ? data : [];
    
    // Armazena a lista completa no estado para validação futura
    state.protocolsWithStatus = list;

    const filter = (filterEl?.value || state.filters?.prepProtocol || '').toLowerCase();
    const filtered = filter ? list.filter(p => (p.protocolo || '').toLowerCase().includes(filter)) : list;

    tbody.innerHTML = '';
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum protocolo encontrado para o filtro.</td></tr>';
        if (countEl) countEl.textContent = filter ? '0 encontrados' : '';
        return;
    }
    if (countEl) countEl.textContent = filter ? `${filtered.length} encontrados` : '';

    filtered.forEach(protocolo => {
        const tr = document.createElement('tr');
        
        // Verifica se o protocolo está desvinculado para controlar as ações
        const isDesvinculado = protocolo.vinculo_status === 'desvinculado';
        
        // Verifica se o ciclo frio está pronto e o quente está vazio
        const canPromote = !isDesvinculado && 
                           protocolo.ciclo_frio_status === 'Disponível' && 
                           protocolo.ciclo_quente_status === 'Não disponível';

        // Botão de "Promover Carga Fria"
        const promoteButtonHTML = canPromote ? `
            <button class="link-btn" data-action="promote-cold-to-hot" data-protocolo="${protocolo.protocolo}" title="Promover Carga Fria para Quente" aria-label="Promover Carga Fria para Quente">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-indigo-600">
                    <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/>
                </svg>
            </button>
        ` : '';
        
        const createConsultButton = (tipoCiclo) => {
        const label = tipoCiclo === 'frio' ? 'Consultar (Frio)' : 'Consultar (Quente)';
        return `<button class="link-btn link-btn-view" data-protocolo="${protocolo.protocolo}" data-tipo-ciclo="${tipoCiclo}" data-timestamp="${protocolo.created_at}" data-action="consult-prep">${label}</button>`;
    };

        tr.innerHTML = `
            <td class="py-3 px-4 text-left font-semibold text-gray-800">${protocolo.protocolo}</td>
            <td class="py-3 px-4 text-left text-gray-800">${createConsultButton('frio', protocolo.ciclo_frio_status)}</td>
            <td class="py-3 px-4 text-left text-gray-800">${createConsultButton('quente', protocolo.ciclo_quente_status)}</td>
            <td class="py-3 px-4 text-left text-gray-800">
                <div class="flex justify-start gap-3">
                    
                    ${promoteButtonHTML} ${!isDesvinculado ? `
                    <button class="link-btn" data-action="add-piece" data-protocolo="${protocolo.protocolo}" data-timestamp="${protocolo.created_at}" title="Adicionar Peça" aria-label="Adicionar Peça">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-green-600">
                            <path d="M10 4a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V5a1 1 0 011-1z" />
                        </svg>
                    </button>
                    
                    <button class="link-btn text-blue-500 hover:text-blue-700" data-action="edit-protocol" data-protocolo="${protocolo.protocolo}" data-timestamp="${protocolo.created_at}" title="Editar Protocolo" aria-label="Editar Protocolo">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    ` : ''}

                    <button class="link-btn" data-action="delete-row" data-protocolo="${protocolo.protocolo}" data-timestamp="${protocolo.created_at}" title="Excluir Linha" aria-label="Excluir Linha">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-red-600"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                    
                    ${isDesvinculado ? `<span class="text-gray-400 text-sm">Protocolo finalizado</span>` : ''}

                    </div>
            </td>
        </tr>
    `;
    tbody.appendChild(tr);
});

    // Delegação de cliques para ações da tabela Processos
    if (!tbody.dataset.hasDelegation) {
        tbody.dataset.hasDelegation = 'true';
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.getAttribute('data-action');
            const protocolo = btn.getAttribute('data-protocolo') || '';
            const tipoCiclo = btn.getAttribute('data-tipo-ciclo') || '';
            const timestamp = btn.getAttribute('data-timestamp') || '';
            switch (action) {
                // --- NOVA AÇÃO ---
                case 'promote-cold-to-hot':
                    modalHandlers.openPromoteColdToHotModal(protocolo);
                    break;
                // --- FIM DA NOVA AÇÃO ---
                
                case 'add-piece':
                    modalHandlers.openAdicionarPecaProtocoloModal(protocolo, timestamp);
                    break;
                case 'consult-prep':
                    // Consultar peças vinculadas ao protocolo, por ciclo
                    modalHandlers.openVisualizarCargaModal(protocolo, tipoCiclo, timestamp);
                    break;
                case 'edit-protocol':
                    // Abrir modal de edição de protocolo
                    modalHandlers.openEditProtocolModal(protocolo);
                    break;
                case 'delete-row':
                    // Chamar a função de exclusão com modal de confirmação
                    handleExcluirLinha(protocolo, tipoCiclo, timestamp);
                    break;
                default:
                    break;
            }
        });
    }
},
};

    // Listener para receber mensagens do backend (extension.ts)
    window.addEventListener('message', event => {
        const message = event.data;

        // Verifica se há informações de usuário para login automático
        if (message.currentUser) {
            authSystem.setCurrentUser(message.currentUser);
        }

        // Se o acesso foi negado, bloqueia o processamento de outras mensagens
        if (state.accessDenied) {
            return;
        }

        switch (message.command) {
            case 'loadData':
            case 'dataLoaded':
                // Verifica tanto currentUser (loadData) quanto user (dataLoaded)
                const userData = message.currentUser || message.user;
                if (userData) {
                    // Normaliza o formato do usuário para o padrão esperado
                    const normalizedUser = {
                        username: userData.username,
                        type: userData.type || userData.userType,
                        displayName: userData.displayName,
                        permissions: userData.permissions
                    };
                    authSystem.setCurrentUser(normalizedUser);
                }
                break;
            case 'pecasCycleDistributionResult':
                if (message.data) {
                    
                    // Armazena os dados dos gráficos
                    state.chartDistributionData = message.data;
                    
                    // Cancela qualquer timeout anterior para evitar múltiplas renderizações
                    if (window.chartUpdateTimeout) {
                        clearTimeout(window.chartUpdateTimeout);
                    }
                    
                    // Verifica se o dashboard está visível antes de renderizar
                    const dashboardPanel = document.getElementById('controle-dashboard-panel');
                    const isDashboardVisible = dashboardPanel && !dashboardPanel.classList.contains('hidden');
                    
                    if (isDashboardVisible) {
                        // Implementa debounce para evitar múltiplas renderizações
                        window.chartUpdateTimeout = setTimeout(() => {
                            // Verifica se já há gráficos funcionais antes de renderizar
                            const chartIds = ['chart-fronhas', 'chart-toalhas', 'chart-lencol'];
                            const existingCharts = chartIds.filter(id => {
                                const chart = window.charts && window.charts[id];
                                return chart && chart.data && typeof chart.update === 'function';
                            });
                            
                            if (existingCharts.length === chartIds.length && !window.isRenderingCharts) {
                                // Marca que está atualizando para evitar conflitos
                                window.isUpdatingCharts = true;
                                
                                try {
                                    // Atualiza apenas os dados dos gráficos existentes
                                    chartIds.forEach(chartId => {
                                        const chart = window.charts[chartId];
                                        if (chart && chart.data && chart.data.datasets && chart.data.datasets[0]) {
                                            const type = chartId.replace('chart-', '');
                                            const data = message.data.find(d => d.type === type);
                const chartData = data ? [data.range1, data.range2, data.range3, data.range4] : [0,0,0,0];
                                            
                                            // Verifica se os dados realmente mudaram
                                            const currentData = chart.data.datasets[0].data;
                                            const hasChanged = !currentData || 
                                                currentData.length !== chartData.length ||
                                                currentData.some((val, idx) => val !== chartData[idx]);
                                            
                                            if (hasChanged) {
                                                chart.data.datasets[0].data = chartData;
                                                chart.update('none'); // Atualização sem animação para evitar conflitos
                                            }
                                        }
                                    });
                                } catch (error) {
                                    // Se houver erro na atualização, força re-renderização
                                    if (!window.isRenderingCharts) {
                                        renderers.renderPecasCargaCharts(message.data);
                                    }
                                } finally {
                                    window.isUpdatingCharts = false;
                                }
                            } else if (!window.isRenderingCharts && !window.isUpdatingCharts) {
                                renderers.renderPecasCargaCharts(message.data);
                            }
                            
                            window.chartUpdateTimeout = null;
                        }, 100); // Debounce de 100ms
                    } else {
                        // Marca que há dados pendentes para renderização
                        pendingDataRefresh.charts = true;
                    }
                }
                break;
            case 'availablePecasCycleDistributionResult':
                if (message.data) {
                    
                    // Armazena os dados dos gráficos de peças disponíveis
                    state.availableChartDistributionData = message.data;
                    
                    // Cancela qualquer timeout anterior para evitar múltiplas renderizações
                    if (window.availableChartUpdateTimeout) {
                        clearTimeout(window.availableChartUpdateTimeout);
                    }
                    
                    // Verifica se o dashboard está visível antes de renderizar
                    const dashboardPanel = document.getElementById('controle-dashboard-panel');
                    const isDashboardVisible = dashboardPanel && !dashboardPanel.classList.contains('hidden');
                    
                    if (isDashboardVisible) {
                        // Implementa debounce para evitar múltiplas renderizações
                        window.availableChartUpdateTimeout = setTimeout(() => {
                            // Verifica se já há gráficos funcionais antes de renderizar
                            const chartIds = ['chart-fronhas-avail', 'chart-toalhas-avail', 'chart-lencol-avail'];
                            const existingCharts = chartIds.filter(id => {
                                const chart = window.charts && window.charts[id];
                                return chart && chart.data && typeof chart.update === 'function';
                            });
                            
                            if (existingCharts.length === chartIds.length && !window.isRenderingAvailableCharts) {
                                // Marca que está atualizando para evitar conflitos
                                window.isUpdatingAvailableCharts = true;
                                
                                try {
                                    // Atualiza apenas os dados dos gráficos existentes
                                    chartIds.forEach(chartId => {
                                        const chart = window.charts[chartId];
                                        if (chart && chart.data && chart.data.datasets && chart.data.datasets[0]) {
                                            const type = chartId.replace('chart-', '').replace('-avail','');
                                            const data = message.data.find(d => d.type === type);
                                            const chartData = data ? [data.range1, data.range2, data.range3, data.range4] : [0,0,0,0];
                                            
                                            // Verifica se os dados realmente mudaram
                                            const currentData = chart.data.datasets[0].data;
                                            const hasChanged = !currentData || 
                                                currentData.length !== chartData.length ||
                                                currentData.some((val, idx) => val !== chartData[idx]);
                                            
                                            if (hasChanged) {
                                                chart.data.datasets[0].data = chartData;
                                                chart.update('none'); // Atualização sem animação para evitar conflitos
                                            }
                                        }
                                    });
                                } catch (error) {
                                    // Se houver erro na atualização, força re-renderização
                                    if (!window.isRenderingAvailableCharts) {
                                        renderers.renderAvailablePecasCharts(message.data);
                                    }
                                } finally {
                                    window.isUpdatingAvailableCharts = false;
                                }
                            } else if (!window.isRenderingAvailableCharts && !window.isUpdatingAvailableCharts) {
                                renderers.renderAvailablePecasCharts(message.data);
                            }
                            
                            window.availableChartUpdateTimeout = null;
                        }, 100); // Debounce de 100ms
                    } else {
                        // Marca que há dados pendentes para renderização
                        pendingDataRefresh.availableCharts = true;
                    }
                }
                break;
            case 'allPecasAtivasResult': 
    const activeModalTitle = document.querySelector('#modal-template .modal-title')?.textContent || '';
    // Atualiza cache global e renderiza tabelas se estiver na página Controle
    state.activePieces = Array.isArray(message.data) ? message.data : [];
    if (document.getElementById('page-controle') && !document.getElementById('page-controle').classList.contains('hidden')) {
        renderActiveTables();
    }
    if (activeModalTitle.includes('Cadastrar Protocolo')) {
        const container = document.getElementById('pecas-list-container');
        if (!container) break;
        
        let tableHTML = `
            <form id="form-cadastrar-protocolo">
                <div class="mb-4">
                    <label for="protocolo-tipo-ciclo-global" class="block text-sm font-medium text-gray-700">Vincular peças ao ciclo:</label>
                    <select id="protocolo-tipo-ciclo-global" name="tipo_ciclo_global" required class="mt-1 block w-full p-2 border rounded-md text-black">
                        <option value="frio">Frio</option>
                        <option value="quente">Quente</option>
                    </select>
                </div>

                <div class="mb-4">
                    <label for="protocolo-name" class="block text-sm font-medium text-gray-700">Nome do Protocolo</label>
                    <input type="text" id="protocolo-name" name="protocolo" required class="mt-1 block w-full p-2 border rounded-md text-black">
                </div>
                
                <div class="mt-4">
                    <label for="peca-filter-input" class="block text-sm font-medium text-gray-700">Filtrar Peças:</label>
                    <input type="text" id="peca-filter-input" placeholder="Filtrar por TAG ou Tipo" class="w-full p-2 border rounded text-black mt-1">
                </div>

                <div class="max-h-96 overflow-y-auto border rounded-md mt-4">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-800">
                    <tr>
                        <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Sel.</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">TAG</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Tipo</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Ciclos</th>
                    </tr>
                </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
        `;
        message.data.forEach(peca => {
            tableHTML += `
                <tr class="text-black">
                    <td class="px-4 py-2"><input type="checkbox" name="peca_ids" value="${peca.id}" class="h-4 w-4"></td>
                    <td class="px-4 py-2 text-sm">${peca.tag_id}</td>
                    <td class="px-4 py-2 text-sm">${peca.type}</td>
                    <td class="px-4 py-2 text-sm">${peca.cycles}</td>
                    </tr>
            `;
        });
        tableHTML += `
                        </tbody>
                    </table>
                </div>
                <div class="mt-4 flex justify-end pt-4 border-t">
                    <button type="submit" class="bg-blue-500 text-white p-2 rounded">Cadastrar Protocolo</button>
                </div>
            </form>
        `;
        container.innerHTML = tableHTML;

        // ATUALIZAÇÃO NO SUBMIT DO FORMULÁRIO
        document.getElementById('form-cadastrar-protocolo').addEventListener('submit', (e) => {
            e.preventDefault();
            const form = e.target;
            const protocolo = form.protocolo.value;
            const tipoCicloGlobal = form.tipo_ciclo_global.value; // Coleta o valor do novo select global

            // Coletamos apenas os IDs das peças selecionadas
            const peca_ids_selecionadas = [...form.querySelectorAll('input[name="peca_ids"]:checked')].map(cb => parseInt(cb.value));

            // Criamos a estrutura pecas_vinculadas com o tipo de ciclo global
            const pecas_vinculadas = peca_ids_selecionadas.map(pecaId => ({
                peca_id: pecaId,
                tipo_ciclo: tipoCicloGlobal // Usa o tipo de ciclo global para todas as peças selecionadas
            }));

            if (!protocolo || pecas_vinculadas.length === 0) {
                utils.showToast('Nome do protocolo e ao menos uma peça são obrigatórios.', true);
                return;
            }
            const cicloTexto = tipoCicloGlobal === 'frio' ? 'Ciclo Frio ❄️' : 'Ciclo Quente 🔥';
            const confirmMsg = `Confirma o cadastro do protocolo "${protocolo}"?\n\nCiclo: ${cicloTexto}\nQuantidade de peças: ${peca_ids_selecionadas.length}`;

            ui.showConfirmationModal(confirmMsg, () => {
                // Ação confirmada: envia para o backend
                const pecas_vinculadas = peca_ids_selecionadas.map(pecaId => ({
                    peca_id: pecaId,
                    tipo_ciclo: tipoCicloGlobal
                }));
            // ENVIA A NOVA ESTRUTURA DE DADOS
            vscode.postMessage({ command: 'saveProtocoloCarga', data: { protocolo, pecas_vinculadas } });
            utils.closeModal();
        });
    });

        // Lógica de filtro para peças (já existente, mas agora o input está acima da tabela)
        const pecaFilterInput = document.getElementById('peca-filter-input');
        const pecaTableBody = container.querySelector('tbody');
        pecaFilterInput.addEventListener('input', (e) => {
            const filterText = e.target.value.toLowerCase();
            pecaTableBody.querySelectorAll('tr').forEach(row => {
                const tag = row.children[1].textContent?.toLowerCase() || '';
                const type = row.children[2].textContent?.toLowerCase() || '';
                if (tag.includes(filterText) || type.includes(filterText)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
                } else if (activeModalTitle.includes('Adicionar Peça')) {
                    const container = document.getElementById('add-piece-container');
                    if (!container) break;

                    const protocolo = state.modalPreselect?.protocolo || '';
                    if (!protocolo) {
                        utils.showToast('Erro: protocolo não informado para adicionar peça.', true);
                        break;
                    }

                    let tableHTML = `
                        <form id="form-add-piece-to-protocol" class="space-y-4 text-black">
                            <div class="mb-2 text-sm text-gray-700">Protocolo selecionado: <span class="font-semibold">${protocolo}</span></div>
                            <div>
                                <label for="add-piece-tipo-ciclo" class="block text-sm font-medium text-gray-700">Vincular ao ciclo</label>
                                <select id="add-piece-tipo-ciclo" name="tipo_ciclo" required class="mt-1 block w-full p-2 border rounded-md text-black">
                                    <option value="frio" selected>Frio</option>
                                    <option value="quente">Quente</option>
                                </select>
                            </div>

                            <div class="mt-2">
                                <label for="add-piece-filter-input" class="block text-sm font-medium text-gray-700">Filtrar Peças</label>
                                <input type="text" id="add-piece-filter-input" placeholder="Filtrar por TAG ou Tipo" class="w-full p-2 border rounded text-black mt-1">
                            </div>

                            <div class="max-h-96 overflow-y-auto border rounded-md mt-4">
                                <table class="min-w-full divide-y divide-gray-200">
                                    <thead class="bg-gray-800">
                                        <tr>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Sel.</th>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">TAG</th>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Tipo</th>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Ciclos</th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-gray-200">
                    `;
                    message.data.forEach(peca => {
                        tableHTML += `
                            <tr class="text-black">
                                <td class="px-4 py-2"><input type="checkbox" name="peca_ids" value="${peca.id}" class="h-4 w-4"></td>
                                <td class="px-4 py-2 text-sm">${peca.tag_id}</td>
                                <td class="px-4 py-2 text-sm">${peca.type}</td>
                                <td class="px-4 py-2 text-sm">${peca.cycles}</td>
                            </tr>
                        `;
                    });
                    tableHTML += `
                                    </tbody>
                                </table>
                            </div>
                            <div class="mt-4 flex justify-end pt-4 border-t">
                                <button type="submit" class="bg-blue-500 text-white p-2 rounded">Adicionar ao Protocolo</button>
                            </div>
                        </form>
                    `;
                    container.innerHTML = tableHTML;

                    // Submit handler
                    document.getElementById('form-add-piece-to-protocol')?.addEventListener('submit', (e) => {
                        e.preventDefault();
                        const form = e.target;
                        const tipo_ciclo = form.tipo_ciclo ? form.tipo_ciclo.value : 'frio';
                        const selectedIds = [...form.querySelectorAll('input[name="peca_ids"]:checked')].map(cb => parseInt(cb.value, 10));
                        if (selectedIds.length === 0) {
                            utils.showToast('Selecione ao menos uma peça.', true);
                            return;
                        }
                        const pecas_vinculadas = selectedIds.map(id => ({ peca_id: id, tipo_ciclo }));
                        vscode.postMessage({ command: 'saveProtocoloCarga', data: { protocolo, pecas_vinculadas } });
                        utils.closeModal();
                    });

                    // Filtro
                    const filterInput = document.getElementById('add-piece-filter-input');
                    const tableBody = container.querySelector('tbody');
                    filterInput?.addEventListener('input', (e) => {
                        const filterText = e.target.value.toLowerCase();
                        tableBody?.querySelectorAll('tr').forEach(row => {
                            const tag = row.children[1].textContent?.toLowerCase() || '';
                            const type = row.children[2].textContent?.toLowerCase() || '';
                            row.style.display = (tag.includes(filterText) || type.includes(filterText)) ? '' : 'none';
                        });
                    });
                } else if (activeModalTitle.includes('Marcar Peça como Danificada')) {
                    const container = document.getElementById('peca-danificada-container');
                    if (!container) break;

                    // Função para renderizar a tabela com base nos dados filtrados
                    const renderTable = (pecas) => {
                        if (pecas.length === 0) {
                            return '<p class="text-center text-gray-500 mt-4">Nenhuma peça encontrada.</p>';
                        }

                        let tableHTML = `
                            <div class="max-h-96 overflow-y-auto border rounded-md mt-4">
                                <table class="min-w-full divide-y divide-gray-200">
                                    <thead class="bg-gray-800 sticky top-0">
                                        <tr>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">TAG</th>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Tipo</th>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Ciclos</th>
                                            <th class="px-4 py-2 text-center text-xs font-medium text-white uppercase">Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-gray-200 text-black">
                        `;
                        pecas.forEach(peca => {
                            tableHTML += `
                                <tr>
                                    <td class="px-4 py-2 text-sm">${peca.tag_id}</td>
                                    <td class="px-4 py-2 text-sm">${peca.type}</td>
                                    <td class="px-4 py-2 text-sm">${peca.cycles}</td>
                                    <td class="px-4 py-2 text-center">
                                        <button 
                                            class="btn-marcar-danificada bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-xs"
                                            data-tag-id="${peca.tag_id}">
                                            Marcar
                                        </button>
                                    </td>
                                </tr>
                            `;
                        });
                        tableHTML += `
                                    </tbody>
                                </table>
                            </div>
                        `;
                        return tableHTML;
                    };
                    
                    // Constrói a estrutura do modal com filtro e tabela
                    container.innerHTML = `
                        <div>
                            <label for="filter-danificada" class="block text-sm font-medium text-gray-700">Filtrar por TAG ou Tipo:</label>
                            <input type="text" id="filter-danificada" class="w-full p-2 border rounded text-black mt-1" placeholder="Digite para buscar...">
                        </div>
                        <div id="danificada-table-container">
                            ${renderTable(message.data)}
                        </div>
                    `;

                    // Adiciona o listener para o filtro
                    const filterInput = document.getElementById('filter-danificada');
                    const tableContainer = document.getElementById('danificada-table-container');

                    filterInput.addEventListener('input', (e) => {
                        const filterText = e.target.value.toLowerCase();
                        const filteredPecas = message.data.filter(p => 
                            p.tag_id.toLowerCase().includes(filterText) || 
                            p.type.toLowerCase().includes(filterText)
                        );
                        tableContainer.innerHTML = renderTable(filteredPecas);
                    });

                    // Adiciona o listener para os botões de marcar (usando event delegation)
                    container.addEventListener('click', (e) => {
                        const button = e.target.closest('.btn-marcar-danificada');
                        if (button) {
                            const tagId = button.dataset.tagId;
                            ui.showConfirmationModal(
                                `Tem certeza que deseja marcar a peça ${tagId} como danificada? Esta ação a tornará inativa.`,
                                () => {
                                    vscode.postMessage({ command: 'updatePecaStatus', data: { tag_id: tagId, status: 'inativa' } });
                                    // Solicita atualização dos dados para refletir a mudança em toda a UI
                                    vscode.postMessage({ command: 'getAllPecasAtivas', source: 'afterDamageMark' });
                                    vscode.postMessage({ command: 'getPecasCycleDistribution', source: 'afterDamageMark' });
                                    utils.closeModal();
                                }
                            );
                        }
                    });
                }
                break;
            case 'pecasSemVinculoAtivoResult':
                const modalTitle = document.querySelector('#modal-template .modal-title')?.textContent || '';
    
                // Modal de "Cadastrar Protocolo"
                if (modalTitle.includes('Cadastrar Protocolo')) {
                    const container = document.getElementById('pecas-list-container');
                    if (!container) break;
                    
                    let tableHTML = `
                        <form id="form-cadastrar-protocolo">
                            <div class="mb-4">
                                <label for="protocolo-tipo-ciclo-global" class="block text-sm font-medium text-gray-700">Vincular peças ao ciclo:</label>
                                <select id="protocolo-tipo-ciclo-global" name="tipo_ciclo_global" required class="mt-1 block w-full p-2 border rounded-md text-black">
                                    <option value="frio">Frio</option>
                                    <option value="quente">Quente</option>
                                </select>
                            </div>

                            <div class="mb-4">
                                <label for="protocolo-name" class="block text-sm font-medium text-gray-700">Nome do Protocolo</label>
                                <input type="text" id="protocolo-name" name="protocolo" required class="mt-1 block w-full p-2 border rounded-md text-black">
                                <div id="protocolo-error-message" class="protocolo-error-message" style="display: none;">
                                    <svg fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                                    </svg>
                                    <span id="protocolo-error-text">Este protocolo já está cadastrado para este ciclo.</span>
                                </div>
                            </div>
                            
                            <div class="mt-4">
                                <label for="peca-filter-input" class="block text-sm font-medium text-gray-700">Filtrar Peças:</label>
                                <input type="text" id="peca-filter-input" placeholder="Filtrar por TAG ou Tipo" class="w-full p-2 border rounded text-black mt-1">
                            </div>

                            <div class="max-h-96 overflow-y-auto border rounded-md mt-4">
                                <table class="min-w-full divide-y divide-gray-200">
                                    <thead class="bg-gray-800">
                                <tr>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Sel.</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">TAG</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Tipo</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Ciclos</th>
                                </tr>
                            </thead>
                                    <tbody class="bg-white divide-y divide-gray-200">
                    `;
                    message.data.forEach(peca => {
                        let rowClass = 'text-black'; // Classe padrão
                            if (peca.cycles >= 75 && peca.cycles <= 79) {
                                rowClass = 'bg-orange-100 text-orange-800 font-medium';
                            } else if (peca.cycles >= 70) {
                                rowClass = 'bg-yellow-100 text-yellow-800 font-medium';
                            }
                        tableHTML += `
                            <tr class="${rowClass}">
                                <td class="px-4 py-2"><input type="checkbox" name="peca_ids" value="${peca.id}" class="h-4 w-4"></td>
                                <td class="px-4 py-2 text-sm">${peca.tag_id}</td>
                                <td class="px-4 py-2 text-sm">${peca.type}</td>
                                <td class="px-4 py-2 text-sm">${peca.cycles}</td>
                                </tr>
                        `;
                    });
                    tableHTML += `
                                    </tbody>
                                </table>
                            </div>
                            <div class="mt-4 flex justify-end pt-4 border-t">
                                <button type="submit" class="bg-blue-500 text-white p-2 rounded">Cadastrar Protocolo</button>
                            </div>
                        </form>
                    `;
                    container.innerHTML = tableHTML;

                    // Submit handler
                    document.getElementById('form-cadastrar-protocolo').addEventListener('submit', (e) => {
                        e.preventDefault();
                        const form = e.target;
                        const protocolo = form.protocolo.value;
                        const tipoCicloGlobal = form.tipo_ciclo_global.value;

                        const peca_ids_selecionadas = [...form.querySelectorAll('input[name="peca_ids"]:checked')].map(cb => parseInt(cb.value));
                        const pecas_vinculadas = peca_ids_selecionadas.map(pecaId => ({
                            peca_id: pecaId,
                            tipo_ciclo: tipoCicloGlobal
                        }));

                        if (!protocolo || pecas_vinculadas.length === 0) {
                            utils.showToast('Nome do protocolo e ao menos uma peça são obrigatórios.', true);
                            return;
                        }

                        // Modal de confirmação antes de cadastrar
                        ui.showConfirmationModal(
                            `Confirmação de Cadastro do Protocolo: ${protocolo}\nCiclo: ${tipoCicloGlobal === 'frio' ? 'Frio' : 'Quente'}. Deseja confirmar o cadastro deste protocolo?`,
                            () => {
                                vscode.postMessage({ command: 'saveProtocoloCarga', data: { protocolo, pecas_vinculadas } });
                                utils.closeModal();
                            }
                        );
                    });

                    // Filtro para peças
                    const pecaFilterInput = document.getElementById('peca-filter-input');
                    const pecaTableBody = container.querySelector('tbody');
                    pecaFilterInput.addEventListener('input', (e) => {
                        const filterText = e.target.value.toLowerCase();
                        pecaTableBody.querySelectorAll('tr').forEach(row => {
                            const tag = row.children[1].textContent?.toLowerCase() || '';
                            const type = row.children[2].textContent?.toLowerCase() || '';
                            if (tag.includes(filterText) || type.includes(filterText)) {
                                row.style.display = '';
                            } else {
                                row.style.display = 'none';
                            }
                        });
                    });

                // Adicionado para lidar com o modal de "Adicionar Peça"
                } else if (modalTitle.includes('Adicionar Peça ao Protocolo')) {
                    const container = document.getElementById('add-piece-container');
                    if (!container) break;

                    const protocolo = state.modalPreselect?.protocolo || '';
                    if (!protocolo) {
                        utils.showToast('Erro: protocolo não informado para adicionar peça.', true);
                        break;
                    }

                    let tableHTML = `
                        <form id="form-add-piece-to-protocol" class="space-y-4 text-black">
                            <div class="mb-2 text-sm text-gray-700">Protocolo selecionado: <span class="font-semibold">${protocolo}</span></div>
                            <div>
                                <label for="add-piece-tipo-ciclo" class="block text-sm font-medium text-gray-700">Vincular ao ciclo</label>
                                <select id="add-piece-tipo-ciclo" name="tipo_ciclo" required class="mt-1 block w-full p-2 border rounded-md text-black">
                                    <option value="frio" selected>Frio</option>
                                    <option value="quente">Quente</option>
                                </select>
                            </div>

                            <div class="mt-2">
                                <label for="add-piece-filter-input" class="block text-sm font-medium text-gray-700">Filtrar Peças</label>
                                <input type="text" id="add-piece-filter-input" placeholder="Filtrar por TAG ou Tipo" class="w-full p-2 border rounded text-black mt-1">
                            </div>

                            <div class="max-h-96 overflow-y-auto border rounded-md mt-4">
                                <table class="min-w-full divide-y divide-gray-200">
                                    <thead class="bg-gray-800">
                                        <tr>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Sel.</th>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">TAG</th>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Tipo</th>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Ciclos</th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-gray-200">
                    `;
                    message.data.forEach(peca => {
                        tableHTML += `
                            <tr class="text-black">
                                <td class="px-4 py-2"><input type="checkbox" name="peca_ids" value="${peca.id}" class="h-4 w-4"></td>
                                <td class="px-4 py-2 text-sm">${peca.tag_id}</td>
                                <td class="px-4 py-2 text-sm">${peca.type}</td>
                                <td class="px-4 py-2 text-sm">${peca.cycles}</td>
                            </tr>
                        `;
                    });
                    tableHTML += `
                                    </tbody>
                                </table>
                            </div>
                            <div class="mt-4 flex justify-end pt-4 border-t">
                                <button type="submit" class="bg-blue-500 text-white p-2 rounded">Adicionar ao Protocolo</button>
                            </div>
                        </form>
                    `;
                    container.innerHTML = tableHTML;

                    // Submit handler
                    document.getElementById('form-add-piece-to-protocol')?.addEventListener('submit', (e) => {
                        e.preventDefault();
                        const form = e.target;
                        const tipo_ciclo = form.tipo_ciclo ? form.tipo_ciclo.value : 'frio';
                        const selectedIds = [...form.querySelectorAll('input[name="peca_ids"]:checked')].map(cb => parseInt(cb.value, 10));
                        if (selectedIds.length === 0) {
                            utils.showToast('Selecione ao menos uma peça.', true);
                            return;
                        }
                        const pecas_vinculadas = selectedIds.map(id => ({ peca_id: id, tipo_ciclo }));
                        vscode.postMessage({ command: 'saveProtocoloCarga', data: { protocolo, pecas_vinculadas } });
                        utils.closeModal();
                    });

                    // Filtro
                    const filterInput = document.getElementById('add-piece-filter-input');
                    const tableBody = container.querySelector('tbody');
                    filterInput?.addEventListener('input', (e) => {
                        const filterText = e.target.value.toLowerCase();
                        tableBody?.querySelectorAll('tr').forEach(row => {
                            const tag = row.children[1].textContent?.toLowerCase() || '';
                            const type = row.children[2].textContent?.toLowerCase() || '';
                            row.style.display = (tag.includes(filterText) || type.includes(filterText)) ? '' : 'none';
                        });
                    });
                }
                break;
            case 'protocolosComStatusResult':
                state.protocolsWithStatus = message.data || [];

                renderers.renderProtocolosTable(message.data);
                // Configurar exclusão em massa de protocolos por ano
                populateBulkDeleteProtocolsYears(message.data);
                setupBulkDeleteProtocols();
                break;
            case 'refreshProtocolos':
                renderers.renderProtocolosTable(message.data);
                break;
                
            case 'checkPecaExistsResult':
                
               // Verificar se temos dados temporários da peça
                if (window.tempPecaData && window.tempPecaData.tag_id === message.tag_id) {
                    if (message.exists) {
                        // Peça já existe - mostrar toast e não adicionar à lista
                        utils.showToast(`A peça ${message.tag_id} já está cadastrada no banco de dados.`, true);
                    } else {
                        // Peça não existe - adicionar à lista
                        const novaPeca = {
                            ...window.tempPecaData,
                            isExisting: false
                        };
                        
                        pecasParaCadastrar.push(novaPeca);
                        
                        // Acessa o container do modal que está aberto
            const pecasAdicionadasContainer = document.getElementById('pecas-adicionadas-container');
            const pecasAdicionadasLista = document.getElementById('pecas-adicionadas-lista');
            const btnSalvarPecas = document.getElementById('btn-salvar-pecas');

            if (pecasAdicionadasContainer && pecasAdicionadasLista && btnSalvarPecas) {
                // Lógica de renderização (simplificada da sua função original)
                pecasAdicionadasLista.innerHTML = '';
                pecasParaCadastrar.forEach((peca, index) => {
                    const li = document.createElement('li');
                    const isExisting = peca.isExisting;
                    
                    li.className = `flex justify-between items-center p-2 rounded border ${
                        isExisting 
                            ? 'bg-red-50 border-red-300' 
                            : 'bg-white border-gray-300'
                    }`;
                    
                    li.innerHTML = `
                        <div class="flex-1">
                            <span class="font-medium ${isExisting ? 'text-red-700' : 'text-gray-800'}">${peca.tag_id}</span>
                            <span class="text-sm ${isExisting ? 'text-red-600' : 'text-gray-600'} ml-2">(${peca.type})</span>
                            ${isExisting ? '<div class="text-xs text-red-600 mt-1">⚠️ Peça já cadastrada no banco de dados</div>' : ''}
                        </div>
                        <button type="button" class="btn-remover-peca px-2 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600" data-index="${index}">
                            Remover
                        </button>
                    `;
                    pecasAdicionadasLista.appendChild(li);
                });

                // Mostra o container
                pecasAdicionadasContainer.classList.remove('hidden');

                // Atualiza o botão Salvar
                btnSalvarPecas.disabled = pecasParaCadastrar.length === 0;

                utils.showToast(`Peça ${message.tag_id} adicionada à lista.`, false);
            }
        }
                    
                    // Limpar dados temporários
                    delete window.tempPecaData;
                }
                
                if (message.error) {
                    utils.showToast('Erro ao verificar peça. Tente novamente.', true);
                    // Limpar dados temporários em caso de erro
                    delete window.tempPecaData;
                }
                break;
                
            case 'pecaCargaOperationResult':
                if (message.success) {
                    
                    // Mostrar toast com a mensagem do backend
                    utils.showToast(message.message);
                    console.log('Operação bem-sucedida:', message.message);
                    
                    // Se houver peças existentes, mostrar informações adicionais
                    if (message.existingPecas && message.existingPecas.length > 0) {
                        const existingList = message.existingPecas.join(', ');
                        utils.showToast(`Peças já existentes: ${existingList}`, false, 5000);
                    }
                    
                    // Atualizar a tabela de protocolos após operação bem-sucedida
                    vscode.postMessage({ command: 'getProtocolosComStatus', source: 'afterOperation' });
                    // Atualizar a tabela de peças ativas após operação bem-sucedida
                    vscode.postMessage({command: 'getAllPecasAtivas', source: 'afterOperation'});
                    
                    // **ATUALIZAR OS GRÁFICOS APÓS OPERAÇÃO BEM-SUCEDIDA**
                    vscode.postMessage({ command: 'getPecasCycleDistribution', source: 'afterOperation' });
                    
                    // Forçar atualização imediata da tabela de processos se estiver visível
                    setTimeout(() => {
                        if (document.getElementById('controle-processos-panel') && 
                            !document.getElementById('controle-processos-panel').classList.contains('hidden')) {
                            renderers.renderPreparacaoCargaPage();
                        }
                    }, 500);
                    
                } else {
                    utils.showToast(message.error || 'Erro ao processar operação', true);
                    console.error('Erro na operação:', message.error);
                }
                break;
            case 'bulkDeleteInactivePiecesResult':
                if (message.success) {
                    utils.showToast(message.message);

                    vscode.postMessage({ command: 'getAllPecasVencidas', filters: { type: '', tag: '' } });

                    // Limpar o filtro de ano imediatamente para evitar confusão
                    const yearSelect = document.getElementById('bulk-delete-year');
                    if (yearSelect) {
                        yearSelect.value = '';
                    }

                    // Fechar modal de confirmação se estiver aberto
                    utils.closeModal();
                } else {
                    utils.showToast(message.error || 'Erro ao excluir peças inativas', true);
                }
                break;
            case 'bulkDeleteProtocolsByYearResult':
                if (message.success) {
                    utils.showToast(message.message);

                    // Limpar o filtro de ano imediatamente para evitar confusão
                    const yearSelect = document.getElementById('bulk-delete-protocols-year');
                    if (yearSelect) {
                        yearSelect.value = '';
                    }

                    // Fechar modal de confirmação se estiver aberto
                    utils.closeModal();
                } else {
                    utils.showToast(message.error || 'Erro ao excluir protocolos', true);
                }
                break;
            case 'getAllProtocolosCargaResult':
            case 'activeProtocolosCargaResult':
    const activeModalTitleProto = document.querySelector('#modal-template .modal-title')?.textContent || '';
    if (activeModalTitleProto.includes('Consultar Protocolo')) {
        const container = document.getElementById('protocolo-details-container');
        if (!container) break;
        let contentHTML = `
            <div class="space-y-4">
                <label for="protocolo-consulta-select" class="block text-sm font-medium text-gray-700">Selecione um Protocolo</label>
                <select id="protocolo-consulta-select" class="w-full p-2 border rounded text-black">
                    <option value="">-- Selecione --</option>
        `;
        message.data.forEach(item => {
            const protocolo = item.protocolo || item;
            if (protocolo && protocolo !== null && protocolo !== 'null') {
                contentHTML += `<option value="${protocolo}">${protocolo}</option>`;
            }
        });
        contentHTML += `
                </select>
                <div class="mt-4">
                    <label for="ciclo-consulta-select" class="block text-sm font-medium text-gray-700">Tipo de Ciclo</label>
                    <select id="ciclo-consulta-select" class="w-full p-2 border rounded text-black mt-1">
                        <option value="frio" selected>Frio</option>
                        <option value="quente">Quente</option>
                    </select>
                </div>
                <div id="protocolo-consulta-resultado" class="mt-4 border-t pt-4"></div>
            </div>
        `;
        container.innerHTML = contentHTML;
        const cicloSelect = document.getElementById('ciclo-consulta-select');
        const protoSelect = document.getElementById('protocolo-consulta-select');

        const requestDetails = () => {
            const protocolo = protoSelect.value;
            const tipoCiclo = cicloSelect ? cicloSelect.value : 'frio';
            if (protocolo) {
                vscode.postMessage({ 
                    command: 'getProtocoloCargaDetails', 
                    data: { protocolo, tipoCiclo }
                });
            } else {
                document.getElementById('protocolo-consulta-resultado').innerHTML = '';
            }
        };

        protoSelect.addEventListener('change', requestDetails);
        if (cicloSelect) cicloSelect.addEventListener('change', requestDetails);
        // Pré-seleção de protocolo, se disponível
        if (state.modalPreselect?.tipo === 'consultar' && state.modalPreselect?.protocolo) {
            const pre = state.modalPreselect.protocolo;
            if ([...protoSelect.options].some(opt => opt.value === pre)) {
                protoSelect.value = pre;
                requestDetails();
                // Limpa estado de pré-seleção
                state.modalPreselect = null;
            }
        }
    } else if (activeModalTitleProto.includes('Descadastrar Protocolo')) {
        const container = document.getElementById('descadastrar-protocolo-container');
        if (!container) break;
        let formHTML = `
            <form id="form-descadastrar-protocolo" class="space-y-4 text-black">
                <label for="protocolo-descadastro-select" class="block text-sm font-medium text-gray-700">Selecione o Protocolo para Descadastrar</label>
                <select id="protocolo-descadastro-select" name="protocolo" required class="w-full p-2 border rounded text-black">
                    <option value="">-- Selecione --</option>
        `;
        message.data.forEach(protocolo => {
            formHTML += `<option value="${protocolo}">${protocolo}</option>`;
        });
        formHTML += `
                </select>
                <div class="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                            </svg>
                        </div>
                        <div class="ml-3">
                            <h3 class="text-sm font-medium text-yellow-800">Atenção</h3>
                            <div class="mt-2 text-sm text-yellow-700">
                                <p>Esta ação irá remover permanentemente todas as entradas do protocolo selecionado do sistema. Esta operação não pode ser desfeita.</p>
                            </div>
                        </div>
                    </div>
                </div>
                <button type="submit" class="w-full bg-red-500 text-white p-2 rounded">Descadastrar Protocolo</button>
            </form>
        `;
        container.innerHTML = formHTML;
        document.getElementById('form-descadastrar-protocolo').addEventListener('submit', (e) => {
            e.preventDefault();
            const protocolo = e.target.protocolo.value;
            if (!protocolo) {
                utils.showToast('Selecione um protocolo.', true);
                return;
            }

            ui.showConfirmationModal(`Tem certeza que deseja descadastrar permanentemente o protocolo "${protocolo}"? Esta ação removerá todas as entradas do protocolo do sistema e não pode ser desfeita.`, () => {

                vscode.postMessage({ command: 'deleteProtocolo', data: { protocolo } });
                vscode.postMessage({ command: 'getProtocolosComStatus', source: 'afterProtocolDelete' });
                vscode.postMessage({ command: 'getAllPecasAtivas', source: 'afterProtocolDelete' });
                vscode.postMessage({ command: 'getPecasCycleDistribution', source: 'afterProtocolDelete' });
                utils.closeModal();
            });
        });
        // Pré-seleção no Descadastrar, se disponível
        if (state.modalPreselect?.tipo === 'descadastrar' && state.modalPreselect?.protocolo) {
            const selectEl = document.getElementById('protocolo-descadastro-select');
            const pre = state.modalPreselect.protocolo;
            if (selectEl && [...selectEl.options].some(opt => opt.value === pre)) {
                selectEl.value = pre;
                state.modalPreselect = null;
            }
        }
    }
    break;
            case 'allPecasVencidasResult':
                handleAllPecasVencidasResult(message.data);
                break;
            case 'protocoloCargaDetailsResult':
                // Este handler serve tanto para "Consultar Protocolo" quanto para "Visualizar Carga"
                const consultaContainer = document.getElementById('protocolo-consulta-resultado');
                const cargaContainer = document.getElementById('view-carga-container');
                const summaryEl = document.getElementById('carga-summary');
                // Dar prioridade ao container de consulta se existir
                const targetContainer = consultaContainer || cargaContainer;

                if (targetContainer) {
                    // Acessar as peças vinculadas do objeto retornado
                    const pecasVinculadas = message.data?.pecas_vinculadas || [];
                    
                    if (!Array.isArray(pecasVinculadas) || pecasVinculadas.length === 0) {
                        targetContainer.innerHTML = '<p class="text-center">Nenhuma peça encontrada para este protocolo.</p>';
                        if (summaryEl) summaryEl.textContent = '';
                        break;
                    }

                    // Contagem por tipo
                    const counts = pecasVinculadas.reduce((acc, p) => {
                        const t = p.type;
                        acc[t] = (acc[t] || 0) + 1;
                        return acc;
                    }, {});
                    
                    // Calcular média dos ciclos
                    const totalCiclos = pecasVinculadas.reduce((acc, p) => acc + (p.ciclos_no_vinculo || 0), 0);
                    const mediaCiclos = pecasVinculadas.length > 0 ? (totalCiclos / pecasVinculadas.length).toFixed(0) : '0';
                    
                    const typeMap = { lencol: 'Lençol', fronhas: 'Fronha', toalhas: 'Toalha de Rosto' };
                    const summaryText = Object.keys(counts).map(k => `${typeMap[k] || k}: ${counts[k]}`).join(' • ') + ` • Média de Ciclos: ${mediaCiclos}`;
                    if (summaryEl) {
                        summaryEl.textContent = summaryText;
                    }

                    let tableHTMLResult = `
    <div class="max-h-96 overflow-y-auto border rounded-md">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-800 sticky top-0">
                                <tr>
                                    <th class="px-4 py-2 text-center text-xs font-medium text-white uppercase">TAG</th>
                                    <th class="px-4 py-2 text-center text-xs font-medium text-white uppercase">Tipo</th>
                                    <th class="px-4 py-2 text-center text-xs font-medium text-white uppercase">Ciclos no Início</th>
                                    <th class="px-4 py-2 text-center text-xs font-medium text-white uppercase">Ciclo Usado</th>
                                    <th class="px-4 py-2 text-center text-xs font-medium text-white uppercase">Status do Vínculo</th>
                                </tr>
                            </thead>
            <tbody class="bg-white divide-y divide-gray-200 text-black">
`;
pecasVinculadas.forEach(peca => {
    const isDesvinculado = peca.vinculo_status === 'desvinculado';
    const rowClass = isDesvinculado ? 'text-gray-400' : '';
    const statusText = isDesvinculado ? 'Desvinculado' : 'Ativo';
    const statusClass = isDesvinculado ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold';

    tableHTMLResult += `
        <tr class="${rowClass}">
            <td class="px-4 py-2 text-sm text-center">${peca.tag_id}</td>
            <td class="px-4 py-2 text-sm text-center">${typeMap[peca.type] || peca.type}</td>
            <td class="px-4 py-2 text-sm text-center">${peca.ciclos_no_vinculo}</td>
            <td class="px-4 py-2 text-sm text-center">${peca.tipo_ciclo === 'frio' ? 'Frio' : 'Quente'}</td>
            <td class="px-4 py-2 text-sm text-center ${statusClass}">${statusText}</td>
        </tr>
    `;
});
tableHTMLResult += `</tbody></table></div>`;
targetContainer.innerHTML = tableHTMLResult;
                }
                break;
            case 'pecaDetailsResult':
                const detailsContainer = document.getElementById('peca-details-result');
                if (!detailsContainer) break;
                if (!message.data) {
                    detailsContainer.innerHTML = '<p class="text-red-500">Peça não encontrada.</p>';
                    break;
                }
                const peca = message.data;
                
                // Determinar classe de status e mensagem
                let statusClass = '';
                let statusMessage = '';
                if (peca.status === 'inativa') {
                    statusClass = 'text-gray-600';
                    statusMessage = ' (Desvinculada)';
                } else if (peca.status === 'vencida') {
                    statusClass = 'text-orange-600';
                    statusMessage = ' (Vencida)';
                } else if (peca.status === 'danificada') {
                    statusClass = 'text-red-600';
                    statusMessage = ' (Danificada)';
                } else {
                    statusClass = 'text-green-600';
                    statusMessage = ' (Ativa)';
                }
                
                let detailsHTML = `
                    <h4 class="font-bold text-lg">${peca.tag_id}</h4>
                    <div class="grid grid-cols-2 gap-2 mt-2 text-sm">
                        <p><span class="font-semibold">Tipo:</span> ${peca.type}</p>
                        <p><span class="font-semibold">Status:</span> <span class="${statusClass} font-semibold">${peca.status}${statusMessage}</span></p>
                        <p><span class="font-semibold">Ciclos:</span> ${peca.cycles}</p>
                        <p><span class="font-semibold">Aquisição:</span> ${utils.formatDate(peca.acquisition_date)}</p>
                    </div>
                `;
                if (peca.protocolos && peca.protocolos.length > 0) {
                    detailsHTML += `
                        <div class="mt-4">
                            <h5 class="font-semibold">Histórico de Protocolos:</h5>
                            <ul class="list-disc list-inside max-h-40 overflow-y-auto text-sm">
                                ${peca.protocolos.map(p => `<li>${p}</li>`).join('')}
                            </ul>
                        </div>
                    `;
                }
                detailsContainer.innerHTML = detailsHTML;
                break;
            case 'openModal':
            try {
                if (!databaseManager) throw new Error('DatabaseManager não inicializado');

            } catch (err) {
                handleError(err, `ERRO ao processar solicitação de modal: ${message.modal}`);
            }
            break;

                case 'allPecasResult':
                const pecasListContainer = document.getElementById('pecas-list-all-container'); // Novo contêiner
                if (!pecasListContainer) break;

                if (!message.data || message.data.length === 0) {
                    pecasListContainer.innerHTML = '<p class="text-gray-500">Nenhuma peça encontrada.</p>';
                    break;
                }

                tableHTML = `
                    <h3 class="text-lg font-bold mb-4 text-gray-800">Lista de Peças de Carga</h3>
                    <div class="max-h-96 overflow-y-auto border rounded-md">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-800 sticky top-0">
                                <tr>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">TAG</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Tipo</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Ciclos</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Status</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Aquisição</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200 text-black">
                `;
                message.data.forEach(peca => {
                    let statusClass = '';
                    if (peca.status === 'vencida') statusClass = 'text-red-600 font-semibold';
                    else if (peca.status === 'danificada' || peca.status === 'inativa') statusClass = 'text-yellow-600 font-semibold';
                    else if (peca.status === 'ativa') statusClass = 'text-green-600';

                    tableHTML += `
                        <tr>
                            <td class="px-4 py-2 text-sm">${peca.tag_id}</td>
                            <td class="px-4 py-2 text-sm">${peca.type}</td>
                            <td class="px-4 py-2 text-sm">${peca.cycles}</td>
                            <td class="px-4 py-2 text-sm ${statusClass}">${peca.status}</td>
                            <td class="px-4 py-2 text-sm">${utils.formatDate(peca.acquisition_date)}</td>
                        </tr>
                    `;
                });
                tableHTML += `
                            </tbody>
                        </table>
                    </div>
                `;
                pecasListContainer.innerHTML = tableHTML;
                break;

                case 'pecasVencidasNotification':
                showExpiredPartsModal(message.data);
                break;

            case 'pecasAfetadasNotification':
                showAffectedPartsModal(message.data);
                // Atualizar a tabela de protocolos após operação que afetou peças
                vscode.postMessage({ command: 'getProtocolosComStatus', source: 'afterAffectedParts' });
                break;
            
            // Casos específicos para controle de carga
            case 'loadControlPecasAtivasResult':
                // Usar o mesmo código que allPecasAtivasResult
                activeModalTitle = document.querySelector('#modal-template .modal-title')?.textContent || '';
                // Atualiza cache global e renderiza tabelas se estiver na página Controle
                state.activePieces = Array.isArray(message.data) ? message.data : [];
                if (document.getElementById('page-controle') && !document.getElementById('page-controle').classList.contains('hidden')) {
                    renderActiveTables();
                }
                if (activeModalTitle.includes('Cadastrar Protocolo')) {
                    const container = document.getElementById('pecas-list-container');
                    if (!container) break;
                    
                    let tableHTML = `
                        <form id="form-cadastrar-protocolo">
                            <div class="mb-4">
                                <label for="protocolo-tipo-ciclo-global" class="block text-sm font-medium text-gray-700">Vincular peças ao ciclo:</label>
                                <select id="protocolo-tipo-ciclo-global" name="tipo_ciclo_global" required class="mt-1 block w-full p-2 border rounded-md text-black">
                                    <option value="frio">Frio</option>
                                    <option value="quente">Quente</option>
                                </select>
                            </div>

                            <div class="mb-4">
                                <label for="protocolo-name" class="block text-sm font-medium text-gray-700">Nome do Protocolo</label>
                                <input type="text" id="protocolo-name" name="protocolo" required class="mt-1 block w-full p-2 border rounded-md text-black">
                                <div id="protocolo-error-message" class="protocolo-error-message" style="display: none;"></div>
                            </div>
                            
                            <div class="mt-4">
                                <label for="peca-filter-input" class="block text-sm font-medium text-gray-700">Filtrar Peças:</label>
                                <input type="text" id="peca-filter-input" placeholder="Filtrar por TAG ou Tipo" class="w-full p-2 border rounded text-black mt-1">
                            </div>

                            <div class="max-h-96 overflow-y-auto border rounded-md mt-4">
                                <table class="min-w-full divide-y divide-gray-200">
                                    <thead class="bg-gray-800">
                                        <tr>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Sel.</th>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">TAG</th>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Tipo</th>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Ciclos</th>
                                            </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-gray-200">
                    `;
                    message.data.forEach(peca => {
                        tableHTML += `
                            <tr class="text-black">
                                <td class="px-4 py-2"><input type="checkbox" name="peca_ids" value="${peca.id}" class="h-4 w-4"></td>
                                <td class="px-4 py-2 text-sm">${peca.tag_id}</td>
                                <td class="px-4 py-2 text-sm">${peca.type}</td>
                                <td class="px-4 py-2 text-sm">${peca.cycles}</td>
                                </tr>
                        `;
                    });
                    tableHTML += `
                                    </tbody>
                                </table>
                            </div>
                            <div class="mt-4 flex justify-end pt-4 border-t">
                                <button type="submit" class="bg-blue-500 text-white p-2 rounded">Cadastrar Protocolo</button>
                            </div>
                        </form>
                    `;
                    container.innerHTML = tableHTML;

                    // Adicionar listeners para validação em tempo real
                    const protocoloInput = document.getElementById('protocolo-name');
                    const tipoCicloSelect = document.getElementById('protocolo-tipo-ciclo-global');
                    
                    protocoloInput.addEventListener('input', validateProtocolo);
                    tipoCicloSelect.addEventListener('change', validateProtocolo);

                    // ATUALIZAÇÃO NO SUBMIT DO FORMULÁRIO
                    document.getElementById('form-cadastrar-protocolo').addEventListener('submit', (e) => {
                        e.preventDefault();
                        const form = e.target;
                        const protocolo = form.protocolo.value;
                        const tipoCicloGlobal = form.tipo_ciclo_global.value;

                        const peca_ids_selecionadas = [...form.querySelectorAll('input[name="peca_ids"]:checked')].map(cb => parseInt(cb.value));
                        const pecas_vinculadas = peca_ids_selecionadas.map(pecaId => ({
                            peca_id: pecaId,
                            tipo_ciclo: tipoCicloGlobal
                        }));

                        if (!protocolo || pecas_vinculadas.length === 0) {
                            utils.showToast('Nome do protocolo e ao menos uma peça são obrigatórios.', true);
                            return;
                        }

                        vscode.postMessage({ command: 'saveProtocoloCarga', data: { protocolo, pecas_vinculadas } });
                        utils.closeModal();
                    });

                    // Lógica de filtro para peças
                    const pecaFilterInput = document.getElementById('peca-filter-input');
                    const pecaTableBody = container.querySelector('tbody');
                    pecaFilterInput.addEventListener('input', (e) => {
                        const filterText = e.target.value.toLowerCase();
                        pecaTableBody.querySelectorAll('tr').forEach(row => {
                            const tag = row.children[1].textContent?.toLowerCase() || '';
                            const type = row.children[2].textContent?.toLowerCase() || '';
                            if (tag.includes(filterText) || type.includes(filterText)) {
                                row.style.display = '';
                            } else {
                                row.style.display = 'none';
                            }
                        });
                    });
                } else if (activeModalTitle.includes('Adicionar Peça')) {
                    const container = document.getElementById('add-piece-container');
                    if (!container) break;

                    const protocolo = state.modalPreselect?.protocolo || '';
                    if (!protocolo) {
                        utils.showToast('Erro: protocolo não informado para adicionar peça.', true);
                        break;
                    }

                    let tableHTML = `
                        <form id="form-adicionar-peca">
                            <div class="mb-4">
                                <label for="add-peca-tipo-ciclo" class="block text-sm font-medium text-gray-700">Vincular peças ao ciclo:</label>
                                <select id="add-peca-tipo-ciclo" name="tipo_ciclo" required class="mt-1 block w-full p-2 border rounded-md text-black">
                                    <option value="frio">Frio</option>
                                    <option value="quente">Quente</option>
                                </select>
                            </div>
                            
                            <div class="mt-4">
                                <label for="add-peca-filter-input" class="block text-sm font-medium text-gray-700">Filtrar Peças:</label>
                                <input type="text" id="add-peca-filter-input" placeholder="Filtrar por TAG ou Tipo" class="w-full p-2 border rounded text-black mt-1">
                            </div>

                            <div class="max-h-96 overflow-y-auto border rounded-md mt-4">
                                <table class="min-w-full divide-y divide-gray-200">
                                    <thead class="bg-gray-800">
                                        <tr>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Sel.</th>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">TAG</th>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Tipo</th>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Ciclos</th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-gray-200">
                    `;
                    message.data.forEach(peca => {
                        tableHTML += `
                            <tr class="text-black">
                                <td class="px-4 py-2"><input type="checkbox" name="peca_ids" value="${peca.id}" class="h-4 w-4"></td>
                                <td class="px-4 py-2 text-sm">${peca.tag_id}</td>
                                <td class="px-4 py-2 text-sm">${peca.type}</td>
                                <td class="px-4 py-2 text-sm">${peca.cycles}</td>
                            </tr>
                        `;
                    });
                    tableHTML += `
                                    </tbody>
                                </table>
                            </div>
                            <div class="mt-4 flex justify-end pt-4 border-t">
                                <button type="submit" class="bg-green-500 text-white p-2 rounded">Adicionar Peças</button>
                            </div>
                        </form>
                    `;
                    container.innerHTML = tableHTML;

                    // Submit handler para adicionar peças
                    document.getElementById('form-adicionar-peca').addEventListener('submit', (e) => {
                        e.preventDefault();
                        const form = e.target;
                        const tipoCiclo = form.tipo_ciclo.value;
                        const peca_ids_selecionadas = [...form.querySelectorAll('input[name="peca_ids"]:checked')].map(cb => parseInt(cb.value));

                        if (peca_ids_selecionadas.length === 0) {
                            utils.showToast('Selecione ao menos uma peça.', true);
                            return;
                        }

                        const pecas_vinculadas = peca_ids_selecionadas.map(pecaId => ({
                            peca_id: pecaId,
                            tipo_ciclo: tipoCiclo
                        }));

                        vscode.postMessage({ 
                            command: 'addPecaToProtocolo', 
                            data: { protocolo, pecas_vinculadas } 
                        });
                        utils.closeModal();
                    });

                    // Filtro para peças
                    const addPecaFilterInput = document.getElementById('add-peca-filter-input');
                    const addPecaTableBody = container.querySelector('tbody');
                    addPecaFilterInput.addEventListener('input', (e) => {
                        const filterText = e.target.value.toLowerCase();
                        addPecaTableBody.querySelectorAll('tr').forEach(row => {
                            const tag = row.children[1].textContent?.toLowerCase() || '';
                            const type = row.children[2].textContent?.toLowerCase() || '';
                            if (tag.includes(filterText) || type.includes(filterText)) {
                                row.style.display = '';
                            } else {
                                row.style.display = 'none';
                            }
                        });
                    });
                }
                break;
                
            case 'loadControlActiveProtocolosResult':
                // Usar o mesmo handler que activeProtocolosCargaResult
                handleActiveProtocolosCargaResult(message.data);
                break;
                
            case 'loadControlProtocolosWithStatusResult':
                // Usar o mesmo handler que protocolosComStatusResult
                renderers.renderProtocolosTable(message.data);
                break;
            case 'dashboardDataResult':
                state.chartData = message.data;
                // Verifica se o painel está visível antes de renderizar
                if (!document.getElementById('controle-dashboard-panel')?.classList.contains('hidden')) {
                    renderers.renderPecasCargaCharts(message.data);
                }
                break;
                

        }
    });

    // Funções de handler para processar respostas do backend
    function handleActiveProtocolosCargaResult(data) {
        const modalTitle = document.querySelector('#modal-template .modal-title')?.textContent || '';
        
        if (modalTitle.includes('Consultar Protocolo')) {
            const container = document.getElementById('protocolo-details-container');
            if (!container) return;
            
            let contentHTML = `
                <div class="space-y-4">
                    <label for="protocolo-consulta-select" class="block text-sm font-medium text-gray-700">Selecione um Protocolo</label>
                    <select id="protocolo-consulta-select" class="w-full p-2 border rounded text-black">
                        <option value="">-- Selecione --</option>
            `;
            
            data.forEach(protocolo => {
                if (protocolo && protocolo !== null && protocolo !== 'null') {
                    contentHTML += `<option value="${protocolo}">${protocolo}</option>`;
                }
            });
            
            contentHTML += `
                    </select>
                    <div class="mt-4">
                        <label for="ciclo-consulta-select" class="block text-sm font-medium text-gray-700">Tipo de Ciclo</label>
                        <select id="ciclo-consulta-select" class="w-full p-2 border rounded text-black mt-1">
                            <option value="frio" selected>Frio</option>
                            <option value="quente">Quente</option>
                        </select>
                    </div>
                    <div id="protocolo-consulta-resultado" class="mt-4 border-t pt-4"></div>
                </div>
            `;
            
            container.innerHTML = contentHTML;
            
            const cicloSelect = document.getElementById('ciclo-consulta-select');
            const protoSelect = document.getElementById('protocolo-consulta-select');

            const requestDetails = () => {
                const protocolo = protoSelect.value;
                const tipoCiclo = cicloSelect ? cicloSelect.value : 'frio';
                if (protocolo) {
                    vscode.postMessage({ 
                        command: 'getProtocoloCargaDetails', 
                        data: { protocolo, tipoCiclo }
                    });
                } else {
                    document.getElementById('protocolo-consulta-resultado').innerHTML = '';
                }
            };

            protoSelect.addEventListener('change', requestDetails);
            cicloSelect.addEventListener('change', requestDetails);
            
            // Protocolo será selecionado manualmente pelo usuário
        } else if (modalTitle.includes('Descadastrar Protocolo')) {
            const container = document.getElementById('descadastrar-protocolo-container');
            if (!container) return;
            
            let contentHTML = `
                <div class="space-y-4">
                    <div class="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                </svg>
                            </div>
                            <div class="ml-3">
                                <h3 class="text-sm font-medium text-red-800">Atenção</h3>
                                <div class="mt-2 text-sm text-red-700">
                                    <p>Esta ação irá remover permanentemente o protocolo e desvincular todas as peças associadas.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <form id="form-descadastrar-protocolo" class="space-y-4">
                        <div>
                            <label for="protocolo-descadastrar-select" class="block text-sm font-medium text-gray-700">Protocolo</label>
                            <select id="protocolo-descadastrar-select" name="protocolo" required class="w-full p-2 border rounded text-black mt-1">
                                <option value="">-- Selecione --</option>
            `;
            
            data.forEach(protocolo => {
                contentHTML += `<option value="${protocolo}">${protocolo}</option>`;
            });
            
            contentHTML += `
                            </select>
                        </div>
                        <div>
                            <label for="cycles-to-add" class="block text-sm font-medium text-gray-700">Ciclos a Adicionar</label>
                            <input type="number" id="cycles-to-add" name="cycles_to_add" value="1" min="0" required class="w-full p-2 border rounded text-black mt-1">
                        </div>
                        <div>
                            <label for="tipo-ciclo-descadastrar" class="block text-sm font-medium text-gray-700">Tipo de Ciclo</label>
                            <select id="tipo-ciclo-descadastrar" name="tipo_ciclo" class="w-full p-2 border rounded text-black mt-1">
                                <option value="frio">Frio</option>
                                <option value="quente">Quente</option>
                            </select>
                        </div>
                        <div class="flex justify-end space-x-2 pt-4 border-t">
                            <button type="button" onclick="utils.closeModal()" class="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400">
                                Cancelar
                            </button>
                            <button type="submit" class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
                                Descadastrar
                            </button>
                        </div>
                    </form>
                </div>
            `;
            
            container.innerHTML = contentHTML;
            
            // Adicionar event listener para o formulário
            document.getElementById('form-descadastrar-protocolo').addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = {
                    protocolo: formData.get('protocolo'),
                    cycles_to_add: parseInt(formData.get('cycles_to_add')) || 1,
                    tipo_ciclo: formData.get('tipo_ciclo') || null
                };
                
                if (!data.protocolo) {
                    utils.showToast('Selecione um protocolo.', true);
                    return;
                }
                
                ui.showConfirmationModal(
                    `Tem certeza que deseja descadastrar o protocolo "${data.protocolo}"? Esta ação não pode ser desfeita.`,
                    () => {
                        vscode.postMessage({ 
                            command: 'deleteProtocoloCarga', 
                            data 
                        });
                        utils.closeModal();
                    }
                );
            });
        }
    }

    // Tornar a função disponível globalmente
    window.handleActiveProtocolosCargaResult = handleActiveProtocolosCargaResult;

})();



function handleAllPecasVencidasResult(data) {
    const pecasInativasList = document.getElementById('pecas-inativas-list');
    const pecasInativasStats = document.getElementById('pecas-inativas-stats');
    
    if (!pecasInativasList) return;

    // Armazenar dados originais para filtros
    window.pecasInativasData = data || [];

    // Aplicar filtros
    const filteredData = applyPecasInativasFilters(window.pecasInativasData);

    if (!filteredData || filteredData.length === 0) {
        pecasInativasList.innerHTML = '<div class="text-center py-8 text-gray-500">Nenhuma peça encontrada com os filtros aplicados.</div>';
        if (pecasInativasStats) {
            pecasInativasStats.innerHTML = '<span id="stats-text">Total: 0 peças</span>';
        }
        return;
    }

    let inativasTableHTML = `
        <div class="max-h-96 overflow-y-auto border rounded-md">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50 sticky top-0">
                    <tr>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">TAG</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200 text-black">
    `;

    let vencidasCount = 0;
    let danificadasCount = 0;

    filteredData.forEach(peca => {
        let statusClass = '';
        let statusText = peca.status;
        
        if (peca.status === 'vencida') {
            statusClass = 'text-orange-600 font-semibold';
            statusText = 'Vencida';
            vencidasCount++;
        } else if (peca.status === 'danificada') {
            statusClass = 'text-red-600 font-semibold';
            statusText = 'Danificada';
            danificadasCount++;
        }

        inativasTableHTML += `
            <tr>
                <td class="px-4 py-2 text-sm font-mono">${peca.tag_id}</td>
                <td class="px-4 py-2 text-sm">${peca.type}</td>
                <td class="px-4 py-2 text-sm ${statusClass}">${statusText}</td>
            </tr>
        `;
    });

    inativasTableHTML += `
                </tbody>
            </table>
        </div>
    `;

    pecasInativasList.innerHTML = inativasTableHTML;

    // Atualizar estatísticas
    if (pecasInativasStats) {
        const total = filteredData.length;
        pecasInativasStats.innerHTML = `<span id="stats-text">Total: ${total} peças | Vencidas: ${vencidasCount} | Danificadas: ${danificadasCount}</span>`;
    }

    // Adicionar event listeners para filtros se ainda não existirem
    setupPecasInativasFilters();
    
    // Popular dropdown de anos para exclusão em massa
    populateBulkDeleteYears(window.pecasInativasData);
    
    // Configurar exclusão em massa
    setupBulkDeleteInactive();
}

function applyPecasInativasFilters(data) {
    if (!data || data.length === 0) return [];

    const typeFilter = document.getElementById('filter-type-inativas')?.value || '';
    const tagFilter = document.getElementById('filter-tag-inativas')?.value.toLowerCase() || '';
    

    const filteredData = data.filter(peca => {
        // Filtro por tipo - mapear os valores do filtro para os tipos reais
        if (typeFilter) {
            const normalizedPecaType = (peca.type || '').toLowerCase();
            let expectedType = '';
            
            switch (typeFilter) {
                case 'fronhas':
                    expectedType = 'fronhas';
                    break;
                case 'toalhas':
                    expectedType = 'toalhas';
                    break;
                case 'lencol':
                    expectedType = 'lencol';
                    break;
                default:
                    expectedType = typeFilter.toLowerCase();
            }
            
            if (normalizedPecaType !== expectedType) {
                return false;
            }
        }

        // Filtro por TAG
        if (tagFilter && !peca.tag_id.toLowerCase().includes(tagFilter)) {
            return false;
        }

        return true;
    });
    
    return filteredData;
}

function setupPecasInativasFilters() {
    const typeFilter = document.getElementById('filter-type-inativas');
    const tagFilter = document.getElementById('filter-tag-inativas');
    

    if (typeFilter && !typeFilter.dataset.hasListener) {
        typeFilter.dataset.hasListener = 'true';
        typeFilter.addEventListener('change', () => {
            if (window.pecasInativasData) {
                handleAllPecasVencidasResult(window.pecasInativasData);
            }
        });
    }

    if (tagFilter && !tagFilter.dataset.hasListener) {
        tagFilter.dataset.hasListener = 'true';
        tagFilter.addEventListener('input', () => {
            if (window.pecasInativasData) {
                handleAllPecasVencidasResult(window.pecasInativasData);
            }
        });
    }
}

function populateBulkDeleteYears(data) {
    const yearSelect = document.getElementById('bulk-delete-year');
    if (!yearSelect || !data) return;

    // Extrair anos únicos das datas de status_updated_date
    const years = new Set();
    data.forEach(peca => {
        if (peca.status_updated_date) {
            const year = new Date(peca.status_updated_date).getFullYear();
            if (!isNaN(year)) {
                years.add(year);
            }
        }
    });

    // Limpar opções existentes (exceto a primeira)
    yearSelect.innerHTML = '<option value="">Selecione um ano</option>';

    // Adicionar anos em ordem decrescente
    Array.from(years).sort((a, b) => b - a).forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    });
}

function setupBulkDeleteInactive() {
    const yearSelect = document.getElementById('bulk-delete-year');
    const deleteButton = document.getElementById('btn-bulk-delete-inactive');

    if (!yearSelect || !deleteButton) return;

    // Habilitar/desabilitar botão baseado na seleção
    yearSelect.addEventListener('change', () => {
        deleteButton.disabled = !yearSelect.value;
    });

    // Configurar ação de exclusão
    if (!deleteButton.dataset.hasListener) {
        deleteButton.dataset.hasListener = 'true';
        deleteButton.addEventListener('click', () => {
            const selectedYear = yearSelect.value;
            if (!selectedYear) return;

            // Contar peças que serão excluídas
            const pecasToDelete = window.pecasInativasData.filter(peca => {
                if (!peca.status_updated_date) return false;
                const year = new Date(peca.status_updated_date).getFullYear();
                return year.toString() === selectedYear;
            });

            if (pecasToDelete.length === 0) {
                utils.showToast('Nenhuma peça encontrada para o ano selecionado.', 'warning');
                return;
            }

            ui.showConfirmationModal(
                `Tem certeza que deseja excluir ${pecasToDelete.length} peças que ficaram inativas em ${selectedYear}? Esta ação é irreversível.`,
                () => {
                    vscode.postMessage({
                        command: 'bulkDeleteInactivePieces',
                        year: selectedYear
                    });
                    utils.closeModal();
                }
            );
        });
    }
}

function populateBulkDeleteProtocolsYears(data) {
    const yearSelect = document.getElementById('bulk-delete-protocols-year');
    if (!yearSelect || !data || data.length === 0) return;
    
    // Extract unique years from protocol creation dates
    const years = new Set();
    data.forEach(protocol => {
        if (protocol.created_at) {
            const year = new Date(protocol.created_at).getFullYear();
            if (!isNaN(year)) {
                years.add(year.toString());
            }
        }
    });
    
    // Clear existing options except the first one
    yearSelect.innerHTML = '<option value="">Selecione o ano</option>';
    
    // Add year options in descending order
    Array.from(years).sort((a, b) => b - a).forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    });
}

function setupBulkDeleteProtocols() {
    const yearSelect = document.getElementById('bulk-delete-protocols-year');
    const deleteBtn = document.getElementById('bulk-delete-protocols-btn');
    
    if (!yearSelect || !deleteBtn) return;
    
    // Enable/disable button based on year selection
    yearSelect.addEventListener('change', function() {
        deleteBtn.disabled = !this.value;
    });
    
    // Handle bulk delete
    deleteBtn.addEventListener('click', function() {
        const selectedYear = yearSelect.value;
        if (!selectedYear) return;
        
        // Show confirmation modal using the existing modal structure
        const modalContent = `
            <div class="text-center">
                <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                    <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>
                <p class="text-lg font-semibold mb-2">Tem certeza que deseja excluir todos os protocolos criados em ${selectedYear}?</p>
                <p class="text-sm text-gray-600 mb-6">Esta ação é irreversível e não pode ser desfeita.</p>
                <div class="flex justify-center space-x-4">
                    <button type="button" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400" onclick="utils.closeModal()">
                        Cancelar
                    </button>
                    <button type="button" class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700" onclick="confirmBulkDeleteProtocols('${selectedYear}'); utils.closeModal();">
                        Confirmar Exclusão
                    </button>
                </div>
            </div>
        `;
        
        utils.openModal('Confirmar Exclusão em Massa de Protocolos', modalContent);
    });
}

// Global function for confirming bulk delete protocols
window.confirmBulkDeleteProtocols = function(year) {
    vscode.postMessage({
        command: 'bulkDeleteProtocolsByYear',
        data: { year: year }
    });
    closeModal();
};

function handleProtocoloCargaDetailsResult(data) {
    const resultContainer = document.getElementById('protocolo-consulta-resultado');
    if (!resultContainer) return;

    if (!data || !data.pecas || data.pecas.length === 0) {
        resultContainer.innerHTML = '<div class="text-center py-4 text-gray-500">Nenhuma peça encontrada para este protocolo e ciclo.</div>';
        return;
    }

    let tableHTML = `
        <div class="space-y-4">
            <h4 class="font-semibold text-gray-800">Peças Vinculadas (${data.pecas.length})</h4>
            <div class="max-h-64 overflow-y-auto border rounded-md">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-800 sticky top-0">
                        <tr>
                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">TAG</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Tipo</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Status</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-white uppercase">Ciclos</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200 text-black">
    `;

    data.pecas.forEach(peca => {
        let statusClass = '';
        if (peca.status === 'ativa') {
            statusClass = 'text-green-600 font-semibold';
        } else if (peca.status === 'vencida') {
            statusClass = 'text-orange-600 font-semibold';
        } else if (peca.status === 'danificada') {
            statusClass = 'text-red-600 font-semibold';
        }

        tableHTML += `
            <tr>
                <td class="px-4 py-2 text-sm font-mono">${peca.tag_id}</td>
                <td class="px-4 py-2 text-sm">${peca.type}</td>
                <td class="px-4 py-2 text-sm ${statusClass}">${peca.status}</td>
                <td class="px-4 py-2 text-sm">${peca.cycles || 0}</td>
            </tr>
        `;
    });

    tableHTML += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    resultContainer.innerHTML = tableHTML;
}

function handlePecaDetailsResult(data) {
    const resultContainer = document.getElementById('peca-details-result');
    if (!resultContainer) return;

    if (!data) {
        resultContainer.innerHTML = '<div class="text-center py-4 text-red-500">Peça não encontrada.</div>';
        return;
    }

    let statusClass = '';
    if (data.status === 'ativa') {
        statusClass = 'text-green-600 font-semibold';
    } else if (data.status === 'vencida') {
        statusClass = 'text-orange-600 font-semibold';
    } else if (data.status === 'danificada') {
        statusClass = 'text-red-600 font-semibold';
    }

    const dataAquisicao = data.acquisition_date ? utils.formatDate(data.acquisition_date) : 'N/A';
    const dataVencimento = data.expiration_date ? utils.formatDate(data.expiration_date) : 'N/A';

    resultContainer.innerHTML = `
        <div class="bg-gray-50 p-4 rounded-md">
            <h4 class="font-semibold text-gray-800 mb-3">Detalhes da Peça</h4>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span class="font-medium text-gray-600">TAG:</span>
                    <span class="ml-2 font-mono">${data.tag_id}</span>
                </div>
                <div>
                    <span class="font-medium text-gray-600">Tipo:</span>
                    <span class="ml-2">${data.type}</span>
                </div>
                <div>
                    <span class="font-medium text-gray-600">Status:</span>
                    <span class="ml-2 ${statusClass}">${data.status}</span>
                </div>
                <div>
                    <span class="font-medium text-gray-600">Ciclos:</span>
                    <span class="ml-2">${data.cycles || 0}</span>
                </div>
                <div>
                    <span class="font-medium text-gray-600">Data Aquisição:</span>
                    <span class="ml-2">${dataAquisicao}</span>
                </div>
                <div>
                    <span class="font-medium text-gray-600">Data Vencimento:</span>
                    <span class="ml-2">${dataVencimento}</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Mostra modal com peças vencidas
 * @param {Array} pecasVencidas - Array de peças vencidas
 */
function showExpiredPartsModal(pecasVencidas) {
    if (!Array.isArray(pecasVencidas) || pecasVencidas.length === 0) return;
    const title = 'Atenção: Peças de Carga Vencidas!';
    const listaPecasHTML = pecasVencidas.map(p => `
        <li class="flex justify-between items-center p-2 bg-red-50 rounded-md">
            <span class="font-mono text-sm text-red-800">${p.tag_id}</span>
            <span class="text-xs text-red-600">${p.type}</span>
            <span class="text-xs font-bold text-red-700">${p.cycles} ciclos</span>
        </li>
    `).join('');
    const contentHTML = `
        <div class="space-y-4">
            <p class="text-sm text-gray-700">As seguintes peças atingiram ou ultrapassaram 80 ciclos e devem ser descartadas:</p>
            <ul class="space-y-2 max-h-60 overflow-y-auto">
                ${listaPecasHTML}
            </ul>
        </div>
    `;
    utils.openModal(title, contentHTML);
}

/**
 * Mostra modal com peças afetadas por uma operação
 * @param {Object} dadosAfetadas - Dados das peças afetadas
 */
function showAffectedPartsModal(dadosAfetadas) {
    const data = dadosAfetadas || {};
    const pecasAfetadas = data.pecasAfetadas || [];
    const vencidasNestaOperacao = data.pecasVencidas || [];
    if (!Array.isArray(pecasAfetadas) || pecasAfetadas.length === 0) return;
    
    const titleAfetadas = 'Peças utilizadas no descadastro';
    const modalId = 'affected-parts-modal';
    
    const renderPecasList = (filteredPecas) => {
        return filteredPecas.map(p => {
            const ficouVencida = Array.isArray(vencidasNestaOperacao) && vencidasNestaOperacao.some(v => v.tag_id === p.tag_id);
            let itemBg = 'bg-gray-50';
            let tagColor = 'text-gray-800';
            let typeColor = 'text-gray-600';
            let cyclesColor = 'text-gray-700';
            let statusBadge = '';

            if (ficouVencida || p.cycles >= 80) { // Condição para 'vencida' (vermelho)
                itemBg = 'bg-red-50';
                tagColor = 'text-red-800';
                typeColor = 'text-red-600';
                cyclesColor = 'text-red-700 font-bold';
                statusBadge = '<span class="ml-2 px-2 py-1 text-[10px] font-semibold rounded-full bg-red-200 text-red-800">Vencida</span>';
            } else if (p.cycles >= 76 && p.cycles <= 79) { 
                itemBg = 'bg-orange-100';
                tagColor = 'text-orange-800';
                typeColor = 'text-orange-600';
                cyclesColor = 'text-orange-700 font-bold';
                statusBadge = '<span class="ml-2 px-2 py-1 text-[10px] font-semibold rounded-full bg-orange-200 text-orange-800">Atenção</span>';
            }else if (p.cycles >= 70 && p.cycles <= 75) { 
                itemBg = 'bg-yellow-100';
                tagColor = 'text-yellow-800';
                typeColor = 'text-yellow-600';
                cyclesColor = 'text-yellow-700 font-bold';
                statusBadge = '<span class="ml-2 px-2 py-1 text-[10px] font-semibold rounded-full bg-yellow-200 text-yellow-800">Atenção</span>';
            }
            return `
                <li class="flex justify-between items-center p-2 ${itemBg} rounded-md">
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-sm ${tagColor}">${p.tag_id}</span>
                        ${statusBadge}
                    </div>
                    <span class="text-xs ${typeColor}">${p.type}</span>
                    <span class="text-xs font-bold ${cyclesColor}">${p.cycles} ciclos</span>
                </li>
            `;
        }).join('');
    };
    
    const contentAfetadasHTML = `
        <div class="space-y-4">
            <p class="text-sm text-gray-700">Listamos todas as peças utilizadas neste descadastro com seus ciclos totais. As que se tornaram inativas (vencidas) aparecem destacadas em vermelho.</p>
            
            <div class="mb-4">
                <label for="filter-affected-parts" class="block text-sm font-medium text-gray-700 mb-2">Filtrar peças:</label>
                <input 
                    type="text" 
                    id="filter-affected-parts" 
                    placeholder="Digite TAG ou tipo de peça..." 
                    class="w-full p-2 border border-gray-300 rounded-md text-black text-sm"
                />
                <div class="mt-1 text-xs text-gray-500">
                    <span id="affected-parts-count">${pecasAfetadas.length}</span> peças encontradas
                </div>
            </div>
            
            <ul id="affected-parts-list" class="space-y-2 max-h-60 overflow-y-auto">
                ${renderPecasList(pecasAfetadas)}
            </ul>
        </div>
    `;
    
    window.utils.openModal(titleAfetadas, contentAfetadasHTML);
    
    // Adicionar funcionalidade de filtro após o modal ser aberto
    setTimeout(() => {
        const filterInput = document.getElementById('filter-affected-parts');
        const partsList = document.getElementById('affected-parts-list');
        const countElement = document.getElementById('affected-parts-count');
        
        if (filterInput && partsList && countElement) {
            filterInput.addEventListener('input', (e) => {
                const filterValue = e.target.value.toLowerCase().trim();
                
                const filteredPecas = pecasAfetadas.filter(p => {
                    const tagMatch = (p.tag_id || '').toString().toLowerCase().includes(filterValue);
                    const typeMatch = (p.type || '').toLowerCase().includes(filterValue);
                    return tagMatch || typeMatch;
                });
                
                partsList.innerHTML = renderPecasList(filteredPecas);
                countElement.textContent = filteredPecas.length;
            });
        }
    }, 100);
}

/**
 * Abre modal para adicionar nova peça
 */
window.openAddPecaModal = function openAddPecaModal() {
    const modalContent = `
        <div class="space-y-4">
            <h3 class="text-lg font-bold text-gray-800">Cadastrar Nova Peça de Carga</h3>
            <form id="form-add-peca" class="space-y-4">
                <div>
                    <label for="peca-tag-id" class="block text-sm font-medium text-gray-700">TAG da Peça</label>
                    <input type="text" id="peca-tag-id" name="tag_id" required 
                           class="mt-1 block w-full p-2 border rounded-md text-black"
                           placeholder="Ex: FRH-001">
                </div>
                <div>
                    <label for="peca-type" class="block text-sm font-medium text-gray-700">Tipo</label>
                    <select id="peca-type" name="type" required class="mt-1 block w-full p-2 border rounded-md text-black">
                        <option value="">Selecione o tipo</option>
                        <option value="fronhas">Fronhas</option>
                        <option value="toalhas">Toalhas de Rosto</option>
                        <option value="lencol">Lençóis</option>
                    </select>
                </div>
                <div>
                    <label for="peca-cycles" class="block text-sm font-medium text-gray-700">Ciclos Iniciais</label>
                    <input type="number" id="peca-cycles" name="cycles" value="0" min="0" 
                           class="mt-1 block w-full p-2 border rounded-md text-black">
                </div>
                <div class="flex justify-end space-x-2 pt-4 border-t">
                    <button type="button" onclick="utils.closeModal()" 
                            class="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400">
                        Cancelar
                    </button>
                    <button type="submit" 
                            class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                        Cadastrar
                    </button>
                </div>
            </form>
        </div>
    `;

    utils.openModal('Cadastrar Peça', modalContent);

    // Adicionar event listener para o formulário
    document.getElementById('form-add-peca').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const pecaData = {
            tag_id: formData.get('tag_id'),
            type: formData.get('type'),
            cycles: parseInt(formData.get('cycles')) || 0,
            status: 'ativa',
            acquisition_date: new Date().toISOString().split('T')[0]
        };

        // Enviar para o backend
        if (typeof vscode !== 'undefined') {
            vscode.postMessage({ 
                command: 'addPecaCarga', 
                data: pecaData 
            });
        }

        utils.closeModal();
        utils.showToast('Peça cadastrada com sucesso!');
        
        // Recarregar dados incluindo gráficos
        setTimeout(() => {
            loadInitialData();
        }, 500);
    });
}

/**
 * Carrega dados em uma tabela específica
 */
function loadTable(type, data) {
    const container = document.getElementById(`table-${type}-container`);
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <p>Nenhuma peça ${type} encontrada</p>
            </div>
        `;
        return;
    }

    const tableHtml = `
        <table class="enhanced-table w-full">
            <thead>
                <tr>
                    <th>TAG</th>
                    <th>Status</th>
                    <th>Ciclos</th>
                    <th>Data Aquisição</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(item => `
                    <tr>
                        <td class="font-medium">${item.tag_id}</td>
                        <td>
                            <span class="px-2 py-1 rounded-full text-xs font-medium ${
                                item.status === 'ativa' || item.status === 'ativo' ? 'bg-green-100 text-green-800' :
                                item.status === 'danificada' ? 'bg-red-100 text-red-800' :
                                item.status === 'vencida' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                            }">
                                ${item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                            </span>
                        </td>
                        <td>${item.cycles || 0}</td>
                        <td>${item.acquisition_date ? new Date(item.acquisition_date).toLocaleDateString('pt-BR') : 'N/A'}</td>
                        <td>
                            <button onclick="viewPieceDetails('${item.tag_id}')" class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs mr-1">
                                Ver
                            </button>
                            ${item.status === 'ativa' || item.status === 'ativo' ? `
                                <button onclick="markPieceAsDamaged('${item.tag_id}')" class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs">
                                    Danificar
                                </button>
                            ` : ''}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = tableHtml;
}

/**
 * Carrega a tabela de processos de carga
 */
function loadProcessTable() {
    const tbody = document.getElementById('preparacao-carga-table-body');
    if (!tbody) return;

    const processData = [
        { protocolo: 'ENA-001', cicloFrio: '2024-01-15 08:00', cicloQuente: '2024-01-15 14:00' },
        { protocolo: 'ENA-002', cicloFrio: '2024-01-14 09:00', cicloQuente: '2024-01-14 15:00' },
        { protocolo: 'ENA-003', cicloFrio: '2024-01-13 10:00', cicloQuente: '2024-01-13 16:00' }
    ];

    tbody.innerHTML = processData.map(item => `
        <tr>
            <td class="font-medium">${item.protocolo}</td>
            <td>${item.cicloFrio}</td>
            <td>${item.cicloQuente}</td>
            <td>
                <button class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">
                    Visualizar
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Configura os filtros das tabelas
 */
function setupFilters() {
    // Filtro para Fronhas
    const filterFronhas = document.getElementById('filter-fronhas');
    if (filterFronhas) {
        filterFronhas.addEventListener('input', (e) => {
            filterTable('fronhas', e.target.value);
        });
    }

    // Filtro para Toalhas
    const filterToalhas = document.getElementById('filter-toalhas');
    if (filterToalhas) {
        filterToalhas.addEventListener('input', (e) => {
            filterTable('toalhas', e.target.value);
        });
    }

    // Filtro para Lençóis
    const filterLencol = document.getElementById('filter-lencol');
    if (filterLencol) {
        filterLencol.addEventListener('input', (e) => {
            filterTable('lencol', e.target.value);
        });
    }

    // Filtro para Processos
    const filterProtocol = document.getElementById('filter-prep-protocol');
    if (filterProtocol) {
        filterProtocol.addEventListener('input', (e) => {
            filterProcessTable(e.target.value);
        });
    }
}

/**
 * Filtra uma tabela específica
 */
function filterTable(type, filterValue) {
    const container = document.getElementById(`table-${type}-container`);
    if (!container) return;

    const rows = container.querySelectorAll('tbody tr');
    let visibleCount = 0;

    rows.forEach(row => {
        const tag = row.querySelector('td:first-child').textContent.toLowerCase();
        const isVisible = tag.includes(filterValue.toLowerCase());
        row.style.display = isVisible ? '' : 'none';
        if (isVisible) visibleCount++;
    });
}

/**
 * Filtra a tabela de processos
 */
function filterProcessTable(filterValue) {
    const tbody = document.getElementById('preparacao-carga-table-body');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    let visibleCount = 0;

    rows.forEach(row => {
        const protocolo = row.querySelector('td:first-child').textContent.toLowerCase();
        const isVisible = protocolo.includes(filterValue.toLowerCase());
        row.style.display = isVisible ? '' : 'none';
        if (isVisible) visibleCount++;
    });

    // Atualizar contador de filtro
    const filterCount = document.getElementById('prep-filter-count');
    if (filterCount) {
        filterCount.textContent = `(${visibleCount} encontrados)`;
    }
}