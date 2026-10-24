# Distributed Cloud Platform

A GCP-first infrastructure platform based on the existing AWS teaching API. The application remains JavaScript/Express with the same user CRUD, MySQL schema and image upload contract. The original AWS repository is not modified.

## Current implementation

| Area | Available now | Verification boundary |
| --- | --- | --- |
| API | Existing CRUD, native S3 and Cloud Storage adapters, configurable provider | HTTP contracts and SDK adapters tested locally |
| Local environment | Docker Compose with MySQL and S3-compatible MinIO | Compose config validated; Docker daemon required to run |
| GCP infrastructure | Bootstrap/WIF, private foundation, COS regional MIG, HTTPS load balancer and Cloud Armor | Terraform schemas and mocked plans tested; not deployed |
| Platform CLI | Config validation, reviewed plans, context-bound apply, status, dev runtime destroy plans | Offline contract tests; requires real inputs and credentials for cloud operations |
| GitHub Actions | PR CI, protected foundation plan/apply, image build and runtime plan, destroy plan | Not executed in GitHub; configure environments and IAM first |
| Release automation | Immutable image references, SBOM/provenance and readable plan artifacts | Runtime release is **plan-only**; automated schema gate, scans and rollback remain work |

Only **GCP** is an infrastructure target today. S3 is supported by the application storage adapter; this does not mean AWS Terraform deployment is implemented. Kubernetes, cross-cloud replication and failover are outside this first delivery.

## Repository layout

```text
apps/api/                    Existing API and storage adapters
platform/cli/                Shared configuration and Terraform CLI
platform/config/             Nonsecret environment schema
platform/environments/gcp/   Dev template and optional prod example
platform/providers/gcp/      COS startup script and tests
infra/bootstrap/gcp/         State bucket, WIF and CI identities
infra/stacks/gcp/foundation/ Network, SQL, storage, registry and runtime identities
infra/stacks/gcp/runtime/    Digest-pinned MIG and HTTPS edge
tests/                      MySQL integration and HTTPS smoke checks
docs/                       Architecture, onboarding and operations
```

## Local quick start

Prerequisites: Node 24 (see `.nvmrc`), npm, and an active Docker Engine with Compose v2. Local passwords in Compose are disposable examples, not cloud credentials. Ports bind to localhost; ensure 3000, 3306, 9000 and 9001 are free.

```sh
npm ci
npm run lint
npm test
docker compose up --build -d
docker compose logs -f api
```

The API is at `http://localhost:3000`. Use `GET /`, `/usuarios` for CRUD, and `POST /upload` with multipart field `imagem` (image MIME, maximum 5 MiB). Upload returns `mensagem`, `url` and `key`; the read URL expires after one hour. MinIO is local S3-compatible storage, not a Cloud Storage emulator.

```sh
curl http://localhost:3000/
curl -H 'Content-Type: application/json' -d '{"nome":"Demo","email":"demo@example.test"}' http://localhost:3000/usuarios
docker compose down
```

For the real database integration test against this disposable local database:

```sh
INTEGRATION_DB_HOST=127.0.0.1 INTEGRATION_DB_USER=local_api INTEGRATION_DB_PASSWORD=local-api-disposable npm run test:integration
```

`docker compose down` retains local data. `docker compose down --volumes` irreversibly removes the local database and uploads. Never use these local credentials in a cloud environment.

## GCP onboarding

Start with [the operator guide](docs/onboarding/gcp.md), then review [Terraform contracts and security boundaries](docs/architecture/terraform.md) and [platform operations](docs/operations/platform.md). Create a project with billing, choose a region and control a DNS hostname before provisioning. Documentation and new guides are in English.

```sh
npm run platform -- validate --target gcp --environment dev --example
npm run platform -- validate --target gcp --environment prod --example
npm run platform -- --help
```

`--example` validates template structure only. Replace the manifest placeholders and commit reviewed configuration before a real plan. Initial bootstrap is an owner operation, not an automatic CLI action. No cloud resources are created by installation or tests.

**Do not apply runtime until the schema has succeeded in an authorized private job.** That automated job/gate is not implemented yet. Foundation creates secret containers, not SQL passwords or users; secure provisioning is an explicit operator prerequisite. Other remaining work includes live GCP acceptance, SQL transport encryption, narrow plan/build IAM, monitoring/budget alerts, image verification and automated rollback. See the architecture guide before enabling the workflows.

This is an **unauthenticated public demo**: anyone can modify records and upload files. HTTPS, private infrastructure and WAF do not provide user authorization. Use synthetic data only. The prod profile adds infrastructure safeguards, not certification for real-user production. Cloud SQL, load balancer, NAT, disks and logging can incur recurring costs; no spending cap is implemented.

## Original educational brief

The original Portuguese brief below records the educational vision, including future goals. It is **not** an implementation or availability guarantee. In particular, multi-region disaster recovery, public permanent image URLs and zero-error chaos experiments are not properties of the current platform.

Projeto de engenharia do caos em cima de sistemas distribuídos, uma abordagem pedagógica. Uso de computação em nuvem, iac, Devops, CI/CD, pipelines, docker, containerização, gestão de secrets, disaster recovery, DNS, multi-AZ, multicloud, tolerância a falhas, transparências de Tanenbaum, escalabilidade, Openness, Confiabilidade, Load Balancer.

**Infraestrutura para Sistemas Distribuídos e Engenharia do Caos: Uma Abordagem Pedagógica e Prática**

Este documento detalha o projeto educacional concebido para o ensino prático de sistemas distribuídos e engenharia de confiabilidade. O objetivo central é preencher a lacuna entre a teoria acadêmica clássica e as práticas modernas do mercado de tecnologia, utilizando uma abordagem de Aprendizagem Baseada em Problemas (PBL). A dinâmica simula os desafios de uma equipe de Engenharia de Confiabilidade (SRE) e DevOps que precisa garantir a alta disponibilidade do sistema de um grande evento sob tráfego massivo e falhas catastróficas.

Para garantir a universalidade do conhecimento, toda a arquitetura foi desenhada de forma **agnóstica de nuvem**, permitindo que os conceitos sejam aplicados em qualquer provedor de computação em nuvem ou até mesmo em topologias *multicloud*.

Abri na comunidade do Discord um grupo para discutirmos sobre ensino de tecnologia no Brasil em diversos níveis de cursos: https://www.rafaellevi.com.br/comunidade-discord.html

Slides: https://docs.google.com/presentation/d/1DbV2CEUvWZv4q2X1mbOf2k0FChxcdL_R/edit?usp=sharing&ouid=101434183171033890314&rtpof=true&sd=true

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


## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha com seus dados de RDS/S3
npm run dev
```


A API sobe em `http://localhost:3000`.

## Rotas

| Método | Rota          | Descrição                          |
|--------|---------------|--------------------------------------|
| GET    | `/`           | Health check                         |
| GET    | `/usuarios`   | Lista todos os usuários              |
| GET    | `/usuarios/:id` | Busca um usuário pelo id           |
| POST   | `/usuarios`   | Cria um usuário (`nome`, `email`, `foto_url`) |
| PUT    | `/usuarios/:id` | Atualiza um usuário                |
| DELETE | `/usuarios/:id` | Remove um usuário                  |
| POST   | `/upload`     | Upload de imagem (form-data, campo `imagem`) → retorna a URL pública no S3 |

## Banco de dados

Execute `src/db/schema.sql` no seu MySQL (RDS) antes de usar a API.

## Docker

```bash
docker build -t api-backend .
docker run -p 3000:3000 --env-file .env api-backend
```
