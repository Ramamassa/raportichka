export function createBot(token) {
  async function call(method, body, signal) {
    let response;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method:'POST', headers:body instanceof FormData?{}:{'Content-Type':'application/json'},
        body:body instanceof FormData?body:JSON.stringify(body), signal:signal || AbortSignal.timeout(45000)
      });
      const data = await response.json();
      if (!data.ok) throw new Error('Telegram rejected request');
      return data.result;
    } catch {
      // Fetch/SDK errors can embed the credential-bearing request URL.
      throw new Error('Telegram недоступен или отклонил запрос. Проверьте токен, интернет и отсутствие второй копии бота.');
    }
  }
  async function sendFile(ownerId, bytes, filename, type) {
    const form = new FormData();
    form.set('chat_id',String(ownerId));
    form.set('document',new Blob([bytes],{type}),filename);
    return call('sendDocument',form);
  }
  async function run(ownerId, url, signal) {
    const me = await call('getMe',{});
    await call('setChatMenuButton',{chat_id:Number(ownerId),menu_button:{type:'web_app',text:'Рапортичка',web_app:{url}}});
    console.log(`БОТ ПОДКЛЮЧЁН: @${me.username}. Откройте его в Telegram и отправьте /start.`);
    let offset = 0;
    while (!signal.aborted) {
      try {
        const updates = await call('getUpdates',{offset,timeout:25,allowed_updates:['message']},signal);
        for (const update of updates) {
          const msg = update.message;
          if (msg?.chat?.type==='private' && String(msg.from?.id)===String(ownerId) && /^\/(start|app|help)(?:@\w+)?(?:\s|$)/.test(msg.text || '')) {
            await call('sendMessage',{chat_id:msg.chat.id,text:'Рапортичка\nОтметки, ведомость и группа — в мини-приложении. Данные сохраняются на вашем ноутбуке. Оставляйте окно запуска открытым.',reply_markup:{inline_keyboard:[[{text:'Открыть Рапортичку',web_app:{url}}]]}},signal);
          }
          offset = update.update_id+1;
        }
      } catch {
        if (!signal.aborted) {
          console.log('Нет связи с Telegram. Повторное подключение через 5 секунд; проверьте интернет и другие копии бота.');
          await new Promise(resolve=>{const timer=setTimeout(done,5000);function done(){clearTimeout(timer);signal.removeEventListener('abort',done);resolve();}signal.addEventListener('abort',done,{once:true});});
        }
      }
    }
  }
  return {call,sendFile,run};
}
