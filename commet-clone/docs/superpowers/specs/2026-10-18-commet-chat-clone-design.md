# Clone do Commet.chat

## Objetivo
Criar um clone do Commet.chat com as seguintes características:

1. **Design inicial**
   - Seguir o estilo do Discord
   - Remover o estilo de abrir conversa do Commet.chat original

2. **Funcionalidades essenciais**
   - Criação de servidor/comunidade bem estruturada
   - Conversa 1:1 com áudio de qualidade e compartilhamento de tela fluido e nítido
   - Esquema de comunidade parecido com servidores e canais do Discord
   - Efeitos sonoros

3. **Plataformas**
   - Web primeiro
   - Arquitetura que permita desktop Linux e Windows depois

4. **Sucesso**
   - Adoção voluntária por outras pessoas

## Limitações

- Não é permitido clonar funcionalidades que violam os termos de serviço do Commet.chat original ou da Matrix.
- O clone deve ser uma implementação independente e não uma cópia direta do código fonte do Commet.chat.

## Decisões de arquitetura

- **Backend**: Backend próprio do zero, sem dependência do protocolo Matrix.
- **Mídia em grupo**: Áudio e compartilhamento de tela devem funcionar em canais de voz em grupo dentro dos servidores, não apenas 1:1.
- **Implantação**: App auto-hospedável, cada pessoa sobe na sua máquina. Não multi-tenant centralizado.
