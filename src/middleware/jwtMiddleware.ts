import express, { NextFunction, Request, Response } from 'express'
import admin from '../Authentication/FirebaseAdmin/admin'
import isDev from '../utils/isDev'

const jwtMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.log('jwtMiddleware')
  console.log('req.headers', req.headers)
  console.log('req.cookies', req.cookies)
  console.log('req.signedCookies', req.signedCookies)
  //   const token = req.cookies.session || ''
  //   console.log("token",token)
  // console.log("isdev",isDev)
  try {
    // // console.log("decode")
    // if (!token)
    //   throw new Error(
    //     'No token found! || token expired! || Email not verified!',
    //   )
    // const decoded = await admin.auth().verifySessionCookie(token, true)
    // if (decoded.email_verified === false) throw new Error('Email not verified!')
    // // console.log(decoded)
    // if (!decoded) throw new Error('Validation failed!')
    // req.user = {
    //   uid: decoded.uid,
    //   email: decoded.email!,
    // }
    next()
  } catch (error) {
    console.log(error)
    res.status(200).send({ codeError: error, isAuthenticated: false })
  }
}

export default jwtMiddleware
