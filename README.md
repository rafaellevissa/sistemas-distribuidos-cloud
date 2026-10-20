# sistemas-distribuidos-cloud
Projeto de engenharia do caos em cima de sistemas distribuídos, uma abordagem pedagógica. Uso de computação em nuvem, iac, Devops, CI/CD, pipelines, docker, containerização, gestão de secrets, disaster recovery, DNS, multi-AZ, multicloud, tolerância a falhas, transparências de Tanenbaum, escalabilidade, Openness, Confiabilidade, Load Balancer.

**Infraestrutura para Sistemas Distribuídos e Engenharia do Caos: Uma Abordagem Pedagógica e Prática**

Este documento detalha o projeto educacional concebido para o ensino prático de sistemas distribuídos e engenharia de confiabilidade. O objetivo central é preencher a lacuna entre a teoria acadêmica clássica e as práticas modernas do mercado de tecnologia, utilizando uma abordagem de Aprendizagem Baseada em Problemas (PBL). A dinâmica simula os desafios de uma equipe de Engenharia de Confiabilidade (SRE) e DevOps que precisa garantir a alta disponibilidade do sistema de um grande evento sob tráfego massivo e falhas catastróficas.

Para garantir a universalidade do conhecimento, toda a arquitetura foi desenhada de forma **agnóstica de nuvem**, permitindo que os conceitos sejam aplicados em qualquer provedor de computação em nuvem ou até mesmo em topologias *multicloud*.

---

### 1. Fundamentação Pedagógica: A Teoria de Tanenbaum na Prática

O projeto materializa os conceitos fundamentais da literatura clássica de Sistemas Distribuídos (como os princípios de Tanenbaum) através de componentes modernos de infraestrutura:

* **Transparência de Falhas e Tolerância a Falhas:** A teoria dita que um sistema distribuído deve ser capaz de ocultar falhas e a recuperação de seus recursos dos usuários. Na prática, isso é alcançado através de um **Load Balancer** (Balanceador de Carga) inteligente acoplado a verificações de integridade (*Health Checks*). Se uma máquina virtual (VM) falhar, o Load Balancer retira imediatamente o nó defeituoso do *pool* e redireciona o tráfego para instâncias saudáveis, mascarando a falha e garantindo a **Confiabilidade** do sistema.


* **Transparência de Localização:** O usuário não precisa saber onde o recurso está fisicamente hospedado. Implementamos isso através de um serviço de **DNS** avançado com políticas de roteamento baseadas em latência. O DNS avalia globalmente qual data center responderá mais rápido e direciona a carga invisivelmente.


* **Escalabilidade (Horizontal):** A arquitetura foi projetada para suportar a adição de novos nós computacionais dinamicamente para lidar com o aumento de carga, provando que o sistema pode crescer sem gargalos estruturais.


* **Openness (Abertura):** O sistema utiliza padrões abertos e protocolos de comunicação universais (como HTTP/REST), além de scripts de automação de inicialização que padronizam a configuração dos nós computacionais independentemente do ambiente.



---

### 2. Arquitetura do Sistema e Redes

A infraestrutura foi desenhada para isolamento, resiliência e alta performance:

* **VPC e Subnets:** Toda a arquitetura reside em uma Rede Virtual Privada (VPC) dividida em sub-redes (subnets) públicas e privadas. Isso garante que recursos críticos, como o banco de dados, fiquem isolados da internet.


* **Múltiplas Zonas de Disponibilidade (Multi-AZ) e Disaster Recovery:** Para evitar Pontos Únicos de Falha (SPOF), os servidores da aplicação e o banco de dados são distribuídos fisicamente em diferentes data centers (Zonas de Disponibilidade). Essa estratégia garante a continuidade dos negócios (Disaster Recovery) mesmo que uma instalação física inteira sofra uma queda de energia ou desastre natural.


* **Armazenamento Desacoplado:** Os arquivos estáticos e os *uploads* de imagens são geridos por um **Bucket de Armazenamento de Objetos**, enquanto os dados transacionais ficam em um **Cluster de Banco de Dados** relacional isolado.


* **Segurança de Sistemas Distribuídos e Firewall:** A segurança é aplicada em múltiplas camadas. Um Web Application Firewall (WAF) protege as rotas da **API REST** contra ataques, enquanto firewalls de rede (grupos de segurança) restringem o tráfego interno apenas entre os nós autorizados.



---

### 3. Cultura DevOps, CI/CD e Infraestrutura como Código (IaC)

A automação é o motor da escalabilidade moderna. O projeto demonstra como o código sai da máquina do desenvolvedor e chega ao ambiente de produção de forma segura e auditável:

* **Containerização com Docker:** A aplicação é empacotada utilizando uma **imagem Docker**, garantindo que o software rode exatamente da mesma forma em qualquer ambiente.


* **Pipelines de CI/CD:** Configuramos esteiras de integração e entrega contínuas. A cada novo *push* no repositório de código, o **build** é disparado, a imagem Docker é gerada e enviada para um **Registry** (um bucket/repositório seguro de armazenamento de imagens).


* **Deploy Automatizado:** O pipeline realiza o **deploy** acessando dinamicamente os servidores na nuvem (via SSH, por exemplo), baixando a nova imagem do registry e reiniciando os contêineres.


* **Gestão de Secrets:** Nenhuma credencial sensível fica exposta no código-fonte. Senhas de banco de dados e chaves de acesso são gerenciadas por cofres de *Secrets*, sendo injetadas de forma segura apenas em tempo de execução pelos pipelines.


* **Infraestrutura como Código (IaC):** Toda a topologia de rede, servidores, clusters e firewalls é declarada em código. Isso permite que ambientes inteiros sejam destruídos e recriados em minutos, garantindo a reprodutibilidade e eliminando configurações manuais propensas a falhas humanas.



---

### 4. Engenharia do Caos e Observabilidade: O Teste de Fogo

O grande momento pedagógico deste projeto é a materialização do caos controlado, provando a eficácia da arquitetura.

* **Teste de Carga:** Utilizando ferramentas de stress, simulamos centenas de usuários virtuais disparando requisições simultâneas contra a **API REST** para validar a robustez e a escalabilidade do sistema.


* **Injeção do Caos:** Com o sistema sob estresse máximo, atuamos como "Agentes do Caos" e desligamos intencionalmente instâncias de servidores (VMs) em tempo real.


* **Observabilidade e Resiliência Ativa:** Através de ferramentas de monitoramento (observabilidade), os alunos acompanham a telemetria do sistema. O Load Balancer identifica a falha do servidor em segundos via *Health Checks* e redireciona todo o tráfego pesado para as instâncias remanescentes nas outras zonas de disponibilidade. O resultado é uma taxa de sucesso mantida em 100%, sem nenhum tempo de inatividade (*downtime*) perceptível para o cliente final.

### 5. Desenvolvimento de Software: O Estado Atual e a Evolução Distribuída

A camada de software atual do projeto atua como uma prova de conceito funcional, consistindo em uma API REST simples desenvolvida em Node.js com o *framework* Express. O foco desta versão inicial é validar a infraestrutura e o *pipeline* de entrega contínua, preparando o terreno para evoluções arquiteturais.

A estrutura de software vigente engloba as seguintes características:

* **Gestão de Recursos (CRUD):** O sistema possui rotas básicas para gerenciar a entidade `usuarios`, permitindo listar, buscar por ID, criar, atualizar e remover registros (`GET`, `POST`, `PUT`, `DELETE` em `/usuarios`).


* **Armazenamento Desacoplado:** Existe um *endpoint* específico (`POST /upload`) que recebe arquivos de imagem via *form-data* e os envia diretamente para um *bucket* de armazenamento de objetos na nuvem, retornando uma URL pública.


* **Persistência Relacional:** Os dados dos usuários são gravados em um banco de dados relacional (MySQL), cuja estrutura inicial é montada através de um script SQL (`schema.sql`).


* **Monitoramento Base:** A aplicação expõe uma rota raiz (`GET /`) que funciona como um *Health Check*, essencial para que o Balanceador de Carga verifique a saúde do contêiner antes de rotear o tráfego.


* **Empacotamento e Entrega:** O código é empacotado através de um `Dockerfile`, gerando uma imagem que é versionada com *tags* semânticas, armazenada em um *registry* de imagens na nuvem e implantada nos servidores por meio do *pipeline* de CI/CD.



Apesar de a infraestrutura já possuir características de sistemas distribuídos, a aplicação em si ainda é concebida como um monólito inicial. O planejamento pedagógico para o futuro do projeto exige que avancemos o nível do desenvolvimento de software para refletir os conceitos de computação distribuída também no código-fonte. O objetivo é quebrar esse monólito em múltiplos serviços (microsserviços ou funções *serverless*), implementar comunicação assíncrona orientada a eventos (sistemas de mensageria), aplicar isolamento de estado e adicionar padrões de resiliência diretamente na aplicação (como *circuit breakers* e estratégias de *retry*). Dessa forma, os alunos poderão experimentar os desafios e as soluções de construir um sistema distribuído ponta a ponta, unindo a engenharia da infraestrutura com a arquitetura de software avançada.


Este documento consolida a visão de que a teoria acadêmica de computação distribuída encontra sua aplicação perfeita nas arquiteturas em nuvem modernas, provando que sistemas elásticos, seguros e altamente confiáveis são construídos através da união entre engenharia de software rigorosa, automação e uma profunda compreensão dos princípios de resiliência.
