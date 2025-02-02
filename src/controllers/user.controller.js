import mongoose from "mongoose";
import express from "express";
import {asyncHandler} from '../utils/asyncHandler.js'
import {ApiError} from '../utils/ApiError.js'
import {User} from '../models/user.model.js'
import {uploadOnCloudinary} from '../utils/cloudinary.js'
import {ApiResponse} from '../utils/ApiResponse.js'
import jwt from "jsonwebtoken"

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user =  await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave:false})

        return {accessToken,refreshToken}

    } catch (error) {
        throw new ApiError(500,"Something went wrong while generating refresh and access tokens")
    }
}
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
        coverImageLocalPath = req.files?.coverImage[0]?.path
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


const loginUser = asyncHandler( async(req,res)=>{
    // get details from frontend   req.body ->data
    // search if they exist already in database
    // password check
    // access and refresh token
    // send cookies
    // fetch other details
    // show them in frontend
    // logout button now available


    const {email,username,password}  = req.body

    if(!(username || email)) throw new ApiError(400,"Username or Password is a required field");


    const user = await User.findOne({$or: [{username},{email}]})

    if(!user){
        throw new ApiError(404,"User doesn't exist");
    }
    
    const isPasswordValid = await user.isPasswordCorrect(password);
    
    if(!isPasswordValid){
    throw new ApiError(401,"Invalid User Credentials");
    }
    const {accessToken,refreshToken} = await generateAccessAndRefreshTokens(user._id);

const loggedInUser = await User.findById(user._id).select("-password -refreshToken")


console.log(loggedInUser)
    const options = {
        httpOnly:true,
        secure: true
    }

    res.status(200).cookie("accessToken",accessToken,options).cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(
            200,
            {
                user:{loggedInUser,accessToken,refreshToken}
            },
            "User logged in successfully"
        )
    )



})


const logoutUser = asyncHandler( async (req,res)=>{
    User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {refreshToken: undefined}
        },
        {
            new:true
        }
    )

    const options = {
        httpOnly:true,
        secure: true
    }

    return res.status(200).clearCookie("accessToken",options).clearCookie("refreshToken",options)
    .json(new ApiResponse(200,{},"User logged out"))
})
const refreshAccessToken = asyncHandler( async(req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorised request");
    }
    try {
        const decodedToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
        const user = await User.findById(decodedToken?._id)
        if(!user){
            throw new ApiError(401,"Invalid Refresh Token")
        }
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh Token is either expired or used")
        }
        const options = {
            httpOnly: true,
            secure: true,
        }
        const {accessToken,newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
        return res.status(200).cookie("Access Token", accessToken, options).cookie("Refresh Token",newRefreshToken, options)
        .json(
            new ApiResponse(
                200,
                {accessToken, newRefreshToken},
                "Access Token Refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401,error?.message || "Invalid Refresh Token")
    }
})


const changeCurrentPassword = asyncHandler( async (req,res) =>{
    const {oldPassword,newPassword} = req.body;
    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
    if(!isPasswordCorrect) {
        throw new ApiError(400,"Invalid Old Password")
    }
    user.password = newPassword;
    await user.save({validateBeforeSave: false})

    return res.status(200).json(
        new ApiResponse(200,{},"Password changed successfully")
    )
})

const getCurrentUser = asyncHandler( async(req,res)=>{
    return res.status(200).json(new ApiResponse(200,req.user,"Current user fetched successfully"))
})


const updateAccountDetails = asyncHandler(async (req,res) => {
    const {fullName,email} = req.body
    
    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required");
    }
    const user = await User.findByIdAndUpdate(req.user?._id,{$set:{
        fullName,
        email
    }},{new:True})
    .select("-password")
    return res.status(200).json(new ApiResponse(200,user,"Account details updated successfully"))
})
const updateUserAvatar = asyncHandler(async (req,res) => {
    const avatarLocalPath = req.files?.path
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar is missing");
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if (!avatarLocalPath) {
        throw new ApiError(400, "Error while uploading on avatar");
    }
    const user = await User.findByIdAndUpdate(req.user?._id,{$set:{
        avatar:avatar.url,
    }},{new:True})
    .select("-password")
    return res.status(200).json(new ApiResponse(200,user,"Avatar updated successfully"))
})
const updateUserCoverImage = asyncHandler(async (req,res) => {
    const CoverImageLocalPath = req.files?.path
    if (!CoverImageLocalPath) {
        throw new ApiError(400, "Cover Image is missing");
    }
    const CoverImage = await uploadOnCloudinary(CoverImageLocalPath)
    if (!CoverImagerLocalPath) {
        throw new ApiError(400, "Error while uploading on avatar");
    }
    const user = await User.findByIdAndUpdate(req.user?._id,{$set:{
        CoverImage:CoverImage.url,
    }},{new:True})
    .select("-password")
    return res.status(200).json(new ApiResponse(200,user,"Cover Image updated successfully"))
})

const getUserChannelProfile = asyncHandler(async (req,res) => {
    const {username} = req.params
    if(!username?.trim()){
        throw new ApiError(400, "Username is missing")
    }
    const channel = await User.aggregate([{
        $match: {
            username: username?.toLowerCase()
        }
    },{$lookup:{
        from: "subscription",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers"
    }},{$lookup:{
        from: "subscription",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo"
    }},
    {
        $addFields: {
            subscribersCount: {
                $size: "$subscribers"
            },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
        isSubscribed: {
                $cond: {
                    if:{
                        $in: [req.user?._id, "$subscribers.subscriber"]
                    },
                    then: true,
                    else: false
                }
        }
        }
    },
    {
        $project: {
            fullName: 1,
            username: 1,
            subscribersCount: 1,
            channelsSubscribedToCount: 1,
            isSubscribed: 1,
            avatar: 1,
            email: 1,
            coverImage: 1,

        }
    }])

    if(!channel?.length){
        throw new ApiError(404,"Channel does not exists")
    }
    return res.status(200).json(
        new ApiResponse(200,channel[0], "User channel fetched successfully")
    )
})


const getWatchHistory = asyncHandler(async (req,res)=>{
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup:{
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1,
                                        
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        },
    ]) 
    return res.status(200)
    .json( new ApiResponse(200,user[0].watchHistory,"Watch History fetched successfully"))
})

export {registerUser, loginUser,logoutUser, refreshAccessToken,changeCurrentPassword,getCurrentUser,changeCurrentPassword,updateAccountDetails,updateUserAvatar,updateUserCoverImage,getUserChannelProfile,getWatchHistory}