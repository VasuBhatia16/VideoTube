import mongoose from "mongoose";
import express from "express";
import {asyncHandler} from '../utils/asyncHandler.js'
import {ApiError} from '../utils/ApiError.js'
import {User} from '../models/user.model.js'
import {uploadOnCloudinary} from '../utils/cloudinary.js'
import {ApiResponse} from '../utils/ApiResponse.js'

const registerUser = asyncHandler( async(req,res)=>{
    //get user details from frontend
    //validation - not empty
    //check if user already exists
    //:username, email
    // file present or not: check for images /avatar
    //upload them to cloudinary, avatar
    //create user object
    //create entry in db
    //remove ped and jwt field from res
    //check for user creation
    //return res



    const {fullName, email,username,password} = req.body
    console.log(email,);
    if([fullName,email,password,username].some((field)=> field?.trim()==="")){
        throw new ApiError(400, "All fields are compulsory")
    }
    const existedUser = await User.findOne({$or:[{username},{email}]})
    if (existedUser){
        throw new ApiError(409, "Username/Email already exists")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path
    // const coverImageLocalPath = req.files?.coverImage[0]?.path
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length>0){
        const coverImageLocalPath = req.files?.coverImage[0]?.path
    }
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar is required")
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);


    if(!avatar){
        throw new ApiError(400,"Avatar is required")
    }

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        username:username.toLowerCase(),
        password,
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!createdUser){
        throw new ApiError(500,"Something went wrong while creating user.")
    }
    return res.status(201).json(
        new ApiResponse(200,createdUser,"User registered successfully")
    )
})

export {registerUser}