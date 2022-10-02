import json
import logging
import os
import threading
import time
from datetime import datetime

import requests
from telegram import Update
from telegram.ext import ApplicationBuilder, ContextTypes, CommandHandler
from telegram.ext import MessageHandler
from telegram.ext import filters


async def start(update: Update, context):
    with open('messages/start.txt') as f:
        text = f.read()
    await context.bot.send_message(chat_id=update.effective_chat.id, text=text)

async def iss(update: Update, context):
    iss_location = requests.get('https://api.wheretheiss.at/v1/satellites/25544').json()
    with open('messages/iss.txt') as f:
        text = f.read()
    text_msg = await context.bot.send_message(chat_id=update.effective_chat.id, text=text)
    loc_msg = await context.bot.send_location(reply_to_message_id=text_msg.message_id, chat_id=update.effective_chat.id, latitude=iss_location['latitude'], longitude=iss_location['longitude'], live_period=100)
    for _ in range(100):
        time.sleep(2)
        iss_location = requests.get('https://api.wheretheiss.at/v1/satellites/25544').json()
        await context.bot.edit_message_live_location(chat_id=update.effective_chat.id, latitude=iss_location['latitude'], longitude=iss_location['longitude'], message_id=loc_msg.message_id)

async def isspass(update: Update, context):
    visibility = requests.get(f'http://{os.environ["TRAX_HOST"]}/visibility', params={'lat': update.message.location.latitude,
                                                                                      'lon': update.message.location.longitude}).json()
    with open('messages/isspass.txt') as f:
        text = f.read()
        text = text.format('\n'.join([datetime.fromtimestamp(v).strftime('%Y-%m-%d %H:%M:%S') for v in visibility]))
    await context.bot.send_message(chat_id=update.effective_chat.id, text=text)

    now = datetime.now()
    run_at = datetime.fromtimestamp(visibility[0])
    delay = (run_at - now).total_seconds() - 5*60

    with open('messages/isspass-reminder.txt') as f:
        text = f.read()

    # TODO: this.
    # threading.Timer(delay, context.bot.send_message(chat_id=update.effective_chat.id, text=text)).start()


async def echo(update: Update, context):
    await context.bot.send_message(chat_id=update.effective_chat.id, text=update.message.text)

if __name__ == '__main__':
    logging.getLogger().setLevel(logging.INFO)
    os.environ['TRAX_HOST'] = 'localhost:4000'
    application = ApplicationBuilder().token('5604253760:AAGVfj83VAE1wEeGIdufG2bVCxnA1He2X2k').build()

    start_handler = CommandHandler('start', start)
    iss_handler = CommandHandler('iss', iss)
    location_handler = MessageHandler(filters.LOCATION, isspass)
    application.add_handler(start_handler)
    application.add_handler(iss_handler)
    application.add_handler(location_handler)

    echo_handler = MessageHandler(filters.TEXT & (~filters.COMMAND), echo)
    application.add_handler(echo_handler)


    application.run_polling()