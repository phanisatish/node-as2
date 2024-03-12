const express = require('express')
const app = express();
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')

app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error:${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

function validatePassword(password) {
  return password.length < 6
}

//AUTHENTICATION WITH JWT TOKEN

const authentication = (request, response, next) => {
  const {tweet} = request.body
  const {tweetId} = request.params
  let jwtToken
  const authorHeader = request.headers['authorization']

  if (authorHeader !== undefined) {
    jwtToken = authorHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.payload = payload
        request.tweetId = tweetId
        request.tweet = tweet
        next()
      }
    })
  }
}

//API1

app.post('/register/', async (request, response) => {
  const usersDetails = request.body
  const {username, password, name, gender} = usersDetails

  const hashPassword = await bcrypt.hash(password, 10)

  const selectUserQuery = `SELECT * FROM user WHERE username = "${username}";`
  const dbUser = await db.get(selectUserQuery)

  if (dbUser === undefined) {
    const createUserQuery = `INSERT INTO user(username,name,password,gender)
        VALUES (
            "${username}",
            "${name}",
            "${hashPassword}",
            "${gender}"
        );`
    if (validatePassword(password)) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const dbResponse = await db.run(createUserQuery)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//API2

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = "${username}";`
  const dbUser = await db.get(selectUserQuery)

  if (dbUser !== undefined) {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password)

    if (isPasswordMatch === true) {
      const payload = {username, userId: dbUser.user_id}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

//API3

app.get('/user/tweets/feed/', authentication, async (request, response) => {
  const {payload} = request;
  const {user_id, name, username, gender} = payload;

  const getTweetQuery = `SELECT username,tweet,date_time AS dateTime
   FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id  INNER JOIN user ON user.user_id = follower.following_user_id
   WHERE 
   follower.follower_user_id = ${user_id}
   ORDER BY 
   date_time DESC 
   LIMIT 4;`;
  const tweets = await db.all(getTweetQuery)
  response.send(tweets);
});

//API4

app.get('/user/following/', authentication, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  const followingUserQuery = `SELECT name FROM follower INNER JOIN user ON 
  user.user_id = follower.following_user_id WHERE 
  follower.follower_user_id = "${user_id}";`
  const followingPeople = await db.all(followingUserQuery)
  response.send(followingPeople)
})

//API5

app.get('/user/followers/', authentication, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  const getfollowingUserQuery = `SELECT DISTINCT name FROM follower INNER JOIN user ON 
  user.user_id = follower.follower_user_id WHERE 
  follower.following_user_id = "${user_id}";`
  const followers = await db.all(getfollowingUserQuery)
  response.send(followers)
})

//API6

app.get('/tweet/:tweetId', authentication, async (request, response) => {
  const {tweetId} = request
  const {payload} = request
  const {user_id, name, username, gender} = payload
  console.log(name, tweetId)
  const tweetQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`
  const tweetsResult = await db.get(tweetQuery)
  const userFollowersQuery = `SELECT * FROM follower INNER JOIN user ON user.user_id = follower.following_user_id
  WHERE 
      follower.follower_user_id = ${user_id};`

  const userFollowers = await db.all(userFollowersQuery)
  if (
    userFollowers.some(item => item.following_user_id === tweetsResult.user_id)
  ) {
    console.log(tweetsResult)
    console.log('----------')
    console.log(userFollowers)
    const getTweetDetailsQuery = `SELECT tweet,
    COUNT(DISTINCT(like.like_id)) AS likes,
    COUNT(DISTINCT(reply.reply_id)) AS replies,
    tweet.date_time AS dateTime
    FROM
    tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    WHERE 
    tweet.tweeet_id = ${tweetId} AND tweet.user_id=${userFollowers[0].user_id};`

    const tweetDetails = await db.get(getTweetDetailsQuery)
    response.send(tweetDetails)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//API7

app.get('/tweets/:tweetId/likes', authentication, async (request, response) => {
  const {tweetId} = request
  const {payload} = request
  const {user_id, name, username, gender} = payload
  console.log(name, tweetId)
  const getLikeUsersQuery = `SELECT * FROM 
  follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
  INNER JOIN user ON user.user_id = like.user_id
  WHERE 
  tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`
  const likedUsers = await db.all(getLikeUsersQuery)
  console.log(likedUsers)
  if (likedUsers.lenght !== 0) {
    let likes = []
    const getNameArray = likedUsers => {
      for (let item of likedUsers) {
        likes.push(item.username)
      }
    }
    getNameArray(likedUsers)
    response.send({likes})
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//API8

app.get(
  '/tweets/:tweetId/replies',
  authentication,
  async (request, response) => {
    const {tweetId} = request
    const {payload} = request
    const {user_id, name, username, gender} = payload
    console.log(name, tweetId)
    const getRepliedUsersQuery = `SELECT * FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
  INNER JOIN user ON user.user_id = reply.user_id
  WHERE
  tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`
    const repliedUsers = await db.all(getRepliedUsersQuery)
    console.log(repliedUsers)

    if (repliedUsers.lenght !== 0) {
      let replies = []
      const getNameArray = repliedUsers => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          }
          replies.push(object)
        }
      }
      getNameArray(repliedUsers)
      response.send({replies})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API9

app.get('/user/tweets', authentication, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  console.log(name, user_id)
  const getTweetDetailsQuery = `SELECT tweet.tweet AS tweet,
  COUNT(DISTINCT(like.like_id)) AS likes,
  COUNT(DISTINCT(reply.reply_id)) AS replies,
  tweet.date_time AS dateTime
  FROM
  user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id=tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
  WHERE 
  user.user_id = ${user_id}
  GROUP BY
  tweet.tweet_id;`
  const tweetsDetails = await db.all(getTweetDetailsQuery)
  response.send(tweetsDetails)
})
//API10

app.post('/user/tweets', authentication, async (request, response) => {
  const {tweet} = request
  const {tweetId} = request
  const {payload} = request
  const {user_id, name, username, gender} = payload
  console.log(name, tweetId)
  const postTweetQuery = `INSERT INTO tweet (tweet,user_id)
  VALUES(
    "${tweet}",
    "${user_id}"
  );`
  await db.run(postTweetQuery)
  response.send('Created a Tweet')
})

//API11

app.delete('/tweets/:tweetId', authentication, async (request, response) => {
  const {tweetId} = request
  const {payload} = request
  const {user_id, name, username, gender} = payload
  const selectUserQuery = `SELECT * FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`
  const tweetUser = await db.all(selectUserQuery)
  if (tweetUser.length !== 0) {
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet.user_id =${user_id} AND tweet.tweet_id =${tweetId};`
    await db.run(deleteTweetQuery)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

module.exports = app
