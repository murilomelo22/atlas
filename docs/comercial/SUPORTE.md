# Atendimento e coleta opcional

Ajuda/FAQ local no app e site em ajuda.html. Canal de suporte é configurado em commercialConfig.supportEmail, vazio até Murilo definir endereço real. App monta mailto com versão e texto livre para o usuário descrever o problema; **não envia e-mail automaticamente**. Relatório anexo ao corpo exige checkbox independente, desmarcado a cada abertura, com prévia antes de abrir o cliente de e-mail.

Logs locais nesta implementação são um ring buffer em memória com até 50 códigos de lista fechada e versão. Não incluem mensagem de exceção, stack trace, ID de usuário, URL, localização, arquivo, token, conteúdo ou e-mail. Não persistem após fechar app. Diagnósticos de autenticação existentes continuam locais e não entram automaticamente no suporte.

Métricas e falhas JS são dois consentimentos separados, desligados por padrão, salvos por dispositivo e revogáveis. Eventos: app_open, backup_export, sync_success; falhas: UNHANDLED_ERROR/UNHANDLED_REJECTION. Sem consentimento correspondente não há envio; eventos antigos não ficam em fila para envio posterior. Quando habilitados, exigem conta e backend configurado; falha no coletor nunca bloqueia o Atlas. Não há minidumps nativos nem gravação de sessão; crash nativo fora do renderer continua pendente.

Backend valida payload de lista fechada e agrega por dia/evento/versão, sem IDs no agregado. Contador separado por conta/dia limita a 100 eventos e deve ser removido em até 7 dias por cron operacional. Proposta de retenção de agregados: 90 dias, sujeita à aprovação jurídica. Proxy/hosting pode registrar IP: desativar logs de URL/corpo/Authorization e definir retenção explícita. Portanto não declarar anonimização total da infraestrutura só porque payload foi reduzido.

Rotina sugerida (aplicar via agendador do banco com role administrativa após aprovação): `delete from atlas_commercial.telemetry_rate where day < current_date - 7; delete from atlas_commercial.telemetry_daily where day < current_date - 90;`. Nenhuma rotina de retenção é ativada silenciosamente antes da decisão jurídica.

## AÇÕES HUMANAS NECESSÁRIAS

1. Criar endereço/canal real, responsável e rotina de atendimento; preencher supportEmail público.
2. Aprovar política de retenção e conteúdo do consentimento na revisão jurídica; configurar proxy sem dados pessoais em logs.
3. Instalar commercial-telemetry.sql em staging, configurar cron aprovado, testar opt-in/revogação e exclusão dos contadores.
4. Testar abertura do e-mail em Macs com clientes diferentes e em Safari; verificar conteúdo antes de enviar.
5. Definir alertas operacionais e decidir se vale integrar crash nativo com um provedor, sempre com consentimento e contrato revisado.
