import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import dayjs from 'dayjs';
import joi from 'joi'
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app
    .use(cors())
    .use(express.json())

const mongoClient = new MongoClient(process.env.MONGO_URI);

let db;
mongoClient.connect().then(() => {
    db = mongoClient.db('batepapo-uol')
})

const userSchema = joi.object({
    name: joi.string().required(),
    lastStatus: joi.number().required()
});

const messageSchema = joi.object({
    from: joi.string().required(),
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().required(),
    time: joi.string().required()
});

app.get('/participants', async (req, res) => {
    try {
        const names = await db.collection('participants').find().toArray()
        res.send(names).sendStatus(200)
    } catch (error) {
        res.sendStatus(500)
    }
})

app.post('/participants', async (req, res) => {
    const { name } = req.body
    const nameLowerCase = name.toLowerCase()

    try {
        const names = await db.collection('participants').find().toArray()
        const nameExist = names.find(participant => participant.name.toLowerCase() === nameLowerCase)

        if (nameExist) {
            res.sendStatus(409)
            return
        }

        const user = { name: name, lastStatus: Date.now() }
        const validation = userSchema.validate(user);

        if (validation.error) {
            console.log(validation.error.details)
            res.sendStatus(409)
            return
        }

        await db.collection('participants').insertOne(user)
        res.sendStatus(201)
    } catch (error) {
        console.log(error)
        res.sendStatus(500)
    }

})

app.get('/messages', async (req, res) => {
    const limit = parseInt(req.query.limit)
    const { user } = req.headers

    try {
        const messages = await db.collection('messages').find().toArray()

        const userMessages = messages.filter(msg => {
            if (msg.type === 'private_message' && (msg.to !== user || msg.from !== user)) return false
            else return true
        })

        if (limit) res.send(userMessages.slice(-limit))
        else res.send(userMessages)

        res.sendStatus(200)
    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }


})

app.post('/messages', async (req, res) => {
    const { user } = req.headers
    const message = req.body

    try {
        const totalMessage = {
            ...message,
            from: user,
            time: dayjs().format("hh:mm:ss")
        }
        const validation = messageSchema.validate(totalMessage);
        const conditions = totalMessage.type === 'message' || totalMessage.type === 'private_message'
        const fromExists = await db.collection("participants").findOne({ name: totalMessage.from })

        if (validation.error || !conditions || !fromExists) {
            res.sendStatus(422)
            return
        }

        await db.collection('messages').insertOne(totalMessage)
        res.sendStatus(201)

    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }
})

app.delete('/messages/:id', async (req, res) => {
    const { user } = req.headers
    const { id } = req.params

    try {
        const messageExists = await db.collection('messages').findOne({ _id: ObjectId(id) })
        console.log(messageExists)

        if (!messageExists) {
            res.sendStatus(404)
            return
        } if (messageExists.from !== user) {
            res.sendStatus(401)
            return
        }
        await db.collection('messages').deleteOne({ _id: new ObjectId(id) });
        res.sendStatus(200);
    } catch (err) {
        res.sendStatus(500);
    }
})

app.post('/status', async (req, res) => {
    const { user } = req.headers

    try {
        const participant = await db.collection('participants').findOne({ name: user })

        if (!participant) {
            res.sendStatus(404)
            return
        }

        await db.collection('participants').updateOne({
            name: user
        }, { $set: { lastStatus: Date.now() } })
        res.sendStatus(200)
    } catch (error) {
        console.log(err);
        res.sendStatus(500);
    }

})

setInterval(async () => {
    const now = Date.now()
    const users = await db.collection('participants').find().toArray()
    users.filter(async (user) => {
        if ((now - user.lastStatus) >= 10000) {
            await db.collection('messages').insertOne({
                from: user.name,
                to: 'Todos',
                text: 'sai da sala...',
                type: 'status',
                time: dayjs().format("hh:mm:ss")
            })
            await db.collection('participants').deleteMany(user)
        }
    })
}, 15000)

app.listen('5000')