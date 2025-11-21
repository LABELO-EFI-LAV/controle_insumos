Histórico de Alterações (Changelog)
Todos as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em Keep a Changelog, e este projeto adere ao Versionamento 
Semântico.

[1.4.8] - 2025-11-21

### Correção

- **Elementos do cronograma:** Foi corrigido a renderização de elementos no cronograma, como as setas de dependência e as tarefas.

[1.4.7] - 2025-11-19

### Adicionado

- **Dependência entre ensaios:** Foi adicionado o suporte para definir dependências entre ensaios, garantindo que um ensaio só seja iniciado após a conclusão de outro.
- **Agendamento de eventos e feriados:** Adicionado o suporte para agendar eventos e feriados no cronograma.


[1.4.6] - 2025-11-14

### Correção

- **Finalização de ensaios:** Foi corrigido o desconto de reagentes quando o ensaio é finalizado no cronograma.

[1.4.5] - 2025-11-14

### Alterado

- **Tooltip de Ensaios e Calibrações:** Adicionado suporte para exibir observações e relatórios nos tooltips do Gantt.

[1.4.4] - 2025-11-14

### Adicionado

- **Edição de Configurações:** Adicionada a funcionalidade de edição para email, feriados e usuários no painel de configurações.
- **Dark Mode:** Adicionado suporte ao modo escuro (dark mode) para a interface do usuário, com estilos personalizados para melhorar a usabilidade em ambientes de alto contraste.

[1.4.3] - 2025-11-12

### Adicionado

- **Tooltips Ricos no Cronograma:** Implementados tooltips detalhados para eventos de ensaio e calibração no Gantt, exibindo protocolo, fabricante, modelo, tensão, carga nominal, terminal/técnico, relatório, período e, quando aplicável, lotes/ciclos/umidade.
- **Container Global de Tooltip:** Adicionado o elemento `#gantt-tooltip` em `webview/index.html` para exibição dos tooltips ricos com posicionamento dinâmico.
- **Utilitário de Tooltip:** Criado módulo de tooltip em `webview/main.js` (`tooltip.showAssay`, `tooltip.showCalibration`, `tooltip.position`, `tooltip.hide`) para controlar renderização e posicionamento.
- **Clique abre Modal:** Eventos do Gantt (ensaios e calibrações) agora abrem diretamente o modal de detalhes ao clicar no cartão.
- **Promover carga:** Foi adicionada a função de "promover" as peças de carga do ciclo frio para o ciclo quente no módulo Controle de Carga
- **Menu de Contexto:** Foi adicionado um botão nos elementos Gantt para exibir um menu contextual com opções como "Iniciar ensaio" e "Excluir".
- **Alças de Elementos:** Foi adicionada a funcionalidade de alças nos elementos Gantt para alterar os dias de ensaio sem acessar o modal de detalhes.

### Alterado

- **Ação “Concluir ensaio” (Contexto/Modal):** O botão/ação passou a abrir o modal de relatório apenas para ensaios de segurança elétrica. Ensaios de eficiência mantêm o fluxo padrão de conclusão.
- **Botões no Modal de Detalhes:** Ajustada a lógica dos botões de finalizar dentro do modal para respeitar o tipo do ensaio (segurança vs. eficiência) ao decidir entre abrir relatório ou finalizar.
- **Relatório Ensaios de Segurança e Secadoras:** Agora é possível adicionar relatórios para ensaios de segurança elétrica e secadoras, com opções separadas no modal.

### Removido

- **Tooltips Antigos:** Removidos tooltips nativos e CSS antigos (atributo `title`, `data-tooltip` e estilo `::after` de calibração) para evitar duplicidade de informações.
- **Atributos `title` nos Botões do Cartão:** Removidos `title` dos botões “Ver Detalhes” e “Menu de Opções” dos eventos do Gantt para eliminar tooltips do navegador.

### Correções

- **Conflito de Tooltips:** Eliminada exibição simultânea de tooltip antigo e novo, garantindo experiência consistente com apenas o tooltip rico.
- **Posicionamento e Legibilidade:** Ajustes no auto-fit de texto e posicionamento do tooltip para manter legibilidade em diferentes tamanhos de cartão.

[1.4.1] - 2025-11-24

### Adicionado

- **Gráficos de Peças Disponíveis:** Implementados gráficos de barras para visualizar a quantidade de peças disponíveis (fronhas, toalhas e lençóis) por faixa de ciclos, similar aos gráficos de peças ativas.
- **Botão de Edição de Protocolos:** Adicionado botão de edição nos protocolos de carga, permitindo modificar as informações do protocolo de forma rápida e intuitiva.
- **Média de Ciclos no Modal:** O modal "Peças do Protocolo" agora exibe a média dos ciclos de todas as cargas, além da quantidade de peças para cada tipo, fornecendo informações mais completas sobre o estado do protocolo.

### Ajustes no Módulo de Controle de Carga

- **Padronização de Cores nos Gráficos:** As colunas dos gráficos de peças disponíveis agora possuem as mesmas cores dos gráficos de peças ativas (#3b82f6, #10b981, #f59e0b, #ef4444), garantindo consistência visual.
- **Rótulos de Dados nos Gráficos:** Adicionados rótulos numéricos brancos no centro das colunas dos gráficos de peças, melhorando a legibilidade dos dados.
- **Botão de Edição Padronizado:** O botão de edição de protocolo foi padronizado com o botão de edição de insumo do módulo de Controle de Insumos, utilizando as mesmas classes CSS (text-blue-500 hover:text-blue-700) e ícone SVG.

### Correções

- **Correção de Erro nos Gráficos:** Resolvido o erro "Cannot read properties of undefined (reading 'y')" nos gráficos do módulo de Controle de Carga através de validação robusta dos dados antes da renderização.
- **Validação de Dados de Gráficos:** Implementada função de validação para garantir que os dados de entrada dos gráficos estejam no formato correto antes da renderização.

[1.4.0] - 2025-11-23

### Adicionado

- **Módulo de Controle de Carga:** Adicionado novo módulo para monitorar e controlar cargas de ensaio, garantindo o controle de vida útil e rastreabilidade de cargas utilizadas nos ensaios.

### Ajustes

- **Ajustes na comunicação com o banco de dados:** Otimização de consultas e operações para melhorar a performance e reduzir o tempo de resposta.

[1.3.0] - 2025-10-23
### Ajustes no sistema de backup incremental

- **Limite alterado para 30 arquivos na pasta de backups incrementais**
- **Limpeza automática após criar cada backup incremental**
- **Backups completos foram mantidos fora desse limite**


[1.2.0] - 2025-09-23
Esta versão introduz melhorias significativas na manipulação dos dados utilizando um banco de dados sqlite.


[1.1.0] - 2025-08-28
Esta versão introduz melhorias significativas na experiência visual, sistema de permissões aprimorado, qualidade dos gráficos e correções importantes na interface.

### Adicionado

- **Cor Específica para Ensaios de Secadora:** Implementado sistema de cores único para ensaios do tipo "Ensaio de Secadora" com tons de rosa (bg-pink-600, bg-pink-200, bg-pink-100), independente do status, para fácil identificação visual.
- **Modal Simplificado para Visualizadores:** Visualizadores agora veem o mesmo modal simplificado de detalhes tanto no dashboard quanto no cronograma, proporcionando experiência consistente.
- **Informações Completas em Ensaios de Segurança:** Adicionados todos os campos informativos no modal de ensaios de segurança (protocolo, fabricante, modelo, terminal, carga nominal, tensão, tipo, status).
- **Mapeamento Correto de Responsáveis:** Campo "Responsável" em ensaios de segurança agora mapeia corretamente o setup para nomes reais (Vitor Leal, Wellyngton Vianna, Leonardo Ebres).

### Alterado

- **Remoção da Barra de Usuário:** Eliminada a barra superior com informações de usuário e botão de logout, aproveitando a autenticação automática baseada no Windows.
- **Drag and Drop Liberado:** Funcionalidade de arrastar e soltar habilitada para todos os tipos de usuário (técnicos e visualizadores), não apenas administradores.
- **Qualidade dos Gráficos Aprimorada:** Implementada renderização em alta resolução (mínimo 2x DPR) para todos os gráficos Chart.js, com elementos visuais mais nítidos e animações suavizadas.
- **Posicionamento da Notificação de Alerta:** Notificação de alerta de estoque removida do posicionamento fixo para não sobrepor elementos de navegação.

### Corrigido

- **Z-Index do Cabeçalho do Cronograma:** Ajustado z-index do cabeçalho do cronograma (gantt-header-container) para z-30, garantindo posicionamento correto e funcionalidade mantida.
- **Botão "Ver Detalhes" no Cronograma:** Corrigido z-index dos botões "Ver Detalhes" para z-20, resolvendo problemas de sobreposição e clicabilidade.
- **Erro JavaScript de Elementos Indefinidos:** Corrigido erro "Cannot set properties of undefined" na função showMainInterface, removendo referências aos elementos do cabeçalho removido.
- **Detecção de Visualizadores:** Implementada verificação dupla para detecção de visualizadores (por permissões e por tipo de usuário), garantindo compatibilidade com autenticação automática.

[1.0.9] - 2025-08-27
Esta versão introduz melhorias significativas na experiência do usuário, sistema de hierarquia, notificações aprimoradas e correções importantes na interface.

### Adicionado

- **Sistema de Hierarquia de Usuários:** Implementado sistema de login com diferentes níveis de acesso (Administrador, Técnico, Visualizador) para controlar permissões de edição e visualização.
- **Notificações Detalhadas:** Sistema de notificações completamente reformulado com explicações detalhadas sobre operações realizadas, incluindo contexto e próximos passos.
- **Função de Mapeamento de Terminais:** Adicionada função `getTerminalName()` para mapear corretamente IDs de setup para nomes de terminais/técnicos.

### Alterado

- **Remoção de Solicitação de Senha:** Eliminada a solicitação de senha ao guardar alterações no cronograma, aproveitando o novo sistema de hierarquia de usuários.
- **Notificações de Sistema:** Todas as notificações do sistema (Windows pop-ups) foram substituídas por logs no console para evitar interrupções.
- **Cards do Dashboard:** Os cards "Ensaios Hoje" e "Próximos Ensaios" agora exibem apenas ensaios de eficiência, mantendo ensaios de segurança limitados ao cronograma.
- **Layout das Notificações:** Notificações agora têm tamanho aumentado, ícones maiores e suporte a quebras de linha para melhor legibilidade.

### Corrigido

- **Exibição de Terminais:** Corrigido problema onde terminais apareciam como "N/A" nos detalhes dos ensaios, agora mostrando corretamente os nomes dos terminais/técnicos.
- **Notificações de Reagentes:** Eliminadas notificações pop-up do Windows para alertas de vencimento de reagentes, mantendo apenas notificações visuais na interface.
- **Parâmetros Não Utilizados:** Removidos parâmetros `existingAssays` e `currentId` não utilizados da função `validateAssayData`.

[1.0.8] - 2025-08-26
Esta versão introduz a personalização completa do cronograma, permitindo a gestão dinâmica de linhas, juntamente com um robusto sistema de 'Desfazer' (Ctrl+Z) e uma série de melhorias de fluxo de trabalho e correções de bugs cruciais.

### Adicionado

- **Gestão Dinâmica de Linhas no Cronograma:** Utilizadores podem agora adicionar e excluir linhas personalizadas tanto para ensaios de Eficiência ("Terminais") como de Segurança ("Técnicos"), tornando o cronograma totalmente adaptável.
- **Nomes das Linhas Editáveis:** As linhas do cronograma agora podem ser renomeadas com um simples duplo clique no seu nome, e a alteração é refletida em toda a aplicação, incluindo nos menus de seleção dos modais.
- **Funcionalidade Desfazer (Ctrl+Z):** Implementado um sistema de histórico de ações que permite desfazer a maioria das alterações feitas no cronograma (adicionar, mover, editar, excluir tarefas e linhas) com o atalho `Ctrl+Z`.

### Alterado

- **Menu "Gerir Linhas" no Cronograma:** Para uma interface mais limpa, os botões "Adicionar Linha de Eficiência" e "Adicionar Linha de Segurança" foram agrupados num novo menu expansivo "Gerir Linhas".
- **Modais de Confirmação Unificados:** Todas as caixas de diálogo de confirmação (para excluir insumos, ensaios, linhas, etc.) foram substituídas por um modal customizado e consistente, eliminando a dependência dos diálogos nativos do VS Code e corrigindo erros de "sandbox".
- **Fluxo de Finalização para Ensaios de Segurança:** Ao finalizar um ensaio de segurança, ele agora apenas tem o seu status alterado para "Relatório Emitido" e permanece no cronograma, em vez de ser movido para o histórico de ensaios.
- **Geração de IDs Sequenciais para Novas Linhas:** Ao adicionar novas linhas, o sistema agora atribui IDs sequenciais (ex: 'D', 'E' para segurança e 9, 10 para eficiência) em vez de IDs baseados em data/hora, tornando os dados mais legíveis.

### Corrigido

- **Desaparecimento de Containers ao Editar:** Corrigido um bug crítico onde os containers de ensaios de eficiência desapareciam do cronograma após terem o seu status editado. O erro era causado por uma incompatibilidade de tipos de dados (texto vs. número) no ID do `setup`.
- **Persistência de Novas Linhas:** Resolvido o problema onde as novas linhas dinâmicas adicionadas ao cronograma não eram salvas no ficheiro `database.json` e desapareciam ao recarregar a extensão.
- **Lógica do Botão "Cancelar":** A função do botão "Cancelar" no cronograma foi aprimorada para reverter corretamente a adição ou exclusão de linhas dinâmicas, para além das alterações nas tarefas.
- **Comportamento do Desfazer (Ctrl+Z):** Corrigido o comportamento da função "Desfazer" para que os botões "Guardar Alterações" e "Cancelar" permaneçam visíveis após a sua utilização, refletindo corretamente o estado de "alterações não salvas".
- **Botões de Ação para Calibração:** Corrigido o erro que impedia os botões de "Editar" e "Excluir" de funcionarem nos detalhes dos eventos de calibração.

[1.0.7] - 2025-08-17
Esta versão foca em melhorias de usabilidade, segurança e limpeza da interface, refinando as funcionalidades existentes para um fluxo de trabalho mais coeso.

### Adicionado
- Senha de Acesso para Configurações: A página de "Configurações" agora está protegida e solicita uma senha para acesso, garantindo que apenas utilizadores autorizados possam alterar os parâmetros da aplicação.

### Alterado
- Botão de Relatório Dinâmico: O botão "Adicionar Relatório" na tabela de histórico agora transforma-se em "Editar Relatório" após um relatório ser adicionado, permitindo a sua correção.
- Movimentação de Férias: Os blocos de "Férias" no cronograma agora podem ser arrastados horizontalmente para ajustar as datas.
- Ícone de Detalhes em Férias: Adicionado o ícone de informações aos blocos de "Férias" para permitir a edição ou exclusão do período.
- Interface dos Gráficos: Removidos os rótulos de dados (valores numéricos) de cima das barras na maioria dos gráficos do dashboard para uma visualização mais limpa.

### Corrigido
- Ecrã de Carregamento: Corrigido um erro crítico que impedia a aplicação de sair do ecrã de carregamento inicial.
- Funcionalidades das Configurações: Resolvido um problema que impedia o botão "Guardar" do limite de alerta e o botão de excluir e-mails de funcionarem corretamente.

[1.0.6] - 2025-08-17
Esta versão revoluciona o fluxo de edição do cronograma, tornando-o mais flexível e intuitivo para o planeamento de cenários.

### Alterado
- Fluxo de Edição do Cronograma: O sistema de "desbloquear para editar" foi substituído por um modelo de "editar livremente, guardar com senha". Os utilizadores podem agora mover tarefas livremente para simular cenários.
- Novos Botões no Cronograma: Os botões "Guardar Alterações" e "Cancelar" agora aparecem automaticamente após a primeira modificação, dando ao utilizador controlo explícito para confirmar as alterações com senha ou revertê-las.

### Removido
- Removido o botão de cadeado "Habilitar Edição" do cronograma, que se tornou obsoleto com o novo fluxo de trabalho.

[1.0.5] - 2025-08-16
Esta versão introduziu um sistema de controlo de acesso para o Cronograma, permitindo que a página fosse visualizada por todos, mas editada apenas por utilizadores autorizados mediante senha.

### Adicionado
- Modo "Somente Leitura" para o Cronograma: Por padrão, o cronograma passou a ser carregado num modo de visualização que impedia edições acidentais.
- Sistema de Senha para Edição: Um botão "Habilitar Edição" foi adicionado para solicitar uma senha e desbloquear as funcionalidades de edição.
- Gestão de Senha nas Configurações: Adicionado um novo campo na página de "Configurações" para definir ou alterar a senha de edição.

[1.0.4] - 2025-08-15
Esta versão introduziu a funcionalidade de Cronograma (Gráfico de Gantt), transformando a aplicação numa ferramenta completa de planeamento e visualização.

### Adicionado
- Cronograma Interativo (Gráfico de Gantt): Implementada uma nova página "Cronograma" que exibe todos os ensaios, férias e pendências num Gráfico de Gantt.
- Funcionalidade de Arrastar e Soltar (Drag and Drop): Os eventos no Gantt podem ser movidos dinamicamente para reagendamento.
- Gestão de Férias e Feriados: Adicionada a capacidade de registar férias e feriados, que são visualmente destacados no gráfico.
- Botão de Acesso Rápido aos Detalhes: Um ícone de informações foi adicionado a cada evento no Gantt para abrir o modal com detalhes.
- Visualização de Dias Não-Úteis: O fundo do gráfico agora destaca fins de semana e feriados.

[1.0.3] - 2025-08-08
Esta versão introduz um conjunto abrangente de melhorias focadas na experiência do utilizador, personalização e manutenibilidade do código.

### Adicionado
- Página de Configurações: Permite ao utilizador configurar o e-mail para notificações e o limite de alerta de stock baixo.
- Notificações Visuais (Toast): Adicionado um sistema de notificações para feedback visual imediato.
- Indicador de Carregamento: Um spinner de carregamento agora é exibido na inicialização.
- Busca no Inventário: Adicionado um campo de busca na página de Inventário.
- Histórico de Consumo por Lote: Implementado um botão de "detalhes" na tabela de inventário.
- Dashboard Interativo: Os gráficos do dashboard tornaram-se interativos.

### Alterado
- Visualização dos Gráficos em PDF: Melhorada a legibilidade dos gráficos exportados.

### Corrigido
- Ordenação dos Gráficos no Dashboard: As barras agora são sempre exibidas em ordem decrescente.

[1.0.2] - 2025-08-08
Esta versão foca em melhorias de usabilidade e correções importantes na visualização de dados.

### Alterado
- Relatório por Fornecedor: A tabela de consumo no PDF agora agrupa os dados por fornecedor do insumo.
- Melhoria Visual no Relatório: Valores zero nas tabelas do PDF foram substituídos por um hífen ("-").
- Interface do Sidebar: O botão "Gerar Relatório" agora exibe texto e ícone.

### Corrigido
- Visualização de Datas: Corrigido bug que impedia a exibição das colunas de data.
- Estabilidade de Carregamento: Resolvida uma condição de corrida no carregamento inicial.

### Removido
- Função "Zerar Ensaios": Removida para prevenir a perda acidental de dados.

[1.0.1] - 2025-08-07
Primeira versão estável do LabControl.

### Adicionado
- Funcionalidade de Editar Ensaio.
- Filtros Avançados no Histórico.
- Rótulos de Dados nos Gráficos.
- Identidade Visual da extensão.
- Ficheiros de Documentação e Licença.

### Alterado
- Armazenamento de Dados para a pasta do projeto.
- Geração de Relatórios para abrir "Salvar como...".
- Visibilidade permanente do botão na barra de status.
- Visualização do Gráfico de Estoque para barras verticais.
- Ordenação dos gráficos por relevância.
- Melhorias na tabela de consumo do relatório PDF.

### Corrigido
- Lógica crítica de consumo de reagentes.
- Múltiplos erros de JavaScript e TypeScript.
- Compatibilidade do link de e-mail de alerta.
- Carregamento de imagens e alinhamento em PDF.
- Interface gráfica residual no carregamento.