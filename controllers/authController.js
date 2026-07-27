const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/UserSchema');
const ErrorResponse = require('../utils/errorResponse');

// Generate Access Token (short-lived - 15 minutes)
const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '15m'
  });
};

// Generate Refresh Token (long-lived - random string)
const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString('hex');
};

// Set refresh token expiry (default 7 days)
const setRefreshTokenExpiry = (days = 7) => {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + days);
  return expiryDate;
};

// Hash password function
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

// Compare password function
const comparePassword = async (enteredPassword, hashedPassword) => {
  return await bcrypt.compare(enteredPassword, hashedPassword);
};

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return next(new ErrorResponse('Please provide username, email, and password', 400));
    }
    
    if (password.trim().length === 0) {
      return next(new ErrorResponse('Password cannot be empty', 400));
    }
    
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return next(new ErrorResponse('User already exists with this email or username', 400));
    }
    
    // Hash password before creating user
    const hashedPassword = await hashPassword(password);
    
    const refreshToken = generateRefreshToken();
    const refreshTokenExpiry = setRefreshTokenExpiry();
    
    // Always create as regular user — never accept role from the client
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role: 'user',
      refreshToken,
      refreshTokenExpiry
    });
    
    // Generate access token with actual user ID
    const actualAccessToken = generateAccessToken(user._id);
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      tokens: {
        accessToken: actualAccessToken,
        refreshToken,
        accessTokenExpiresIn: '15m',
        refreshTokenExpiresIn: '7d'
      },
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new ErrorResponse('Please provide email and password', 400));
    }

    if (password.trim().length === 0) {
      return next(new ErrorResponse('Password cannot be empty', 400));
    }

    const user = await User.findOne({ email });
    
    if (!user) {
      return next(new ErrorResponse('Invalid email or password', 401));
    }

    if (!user.password) {
      return next(new ErrorResponse('Invalid user account', 401));
    }

    // Compare password using bcrypt
    const isPasswordValid = await comparePassword(password, user.password);
    
    if (!isPasswordValid) {
      return next(new ErrorResponse('Invalid email or password', 401));
    }

    // Generate new tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken();
    const refreshTokenExpiry = setRefreshTokenExpiry();

    // Save refresh token to database
    user.refreshToken = refreshToken;
    user.refreshTokenExpiry = refreshTokenExpiry;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      tokens: {
        accessToken,
        refreshToken,
        accessTokenExpiresIn: '15m',
        refreshTokenExpiresIn: '7d'
      },
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Refresh Token
// @route   POST /api/v1/auth/refresh-token
// @access  Public
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return next(new ErrorResponse('Refresh token is required', 400));
    }
    
    // Find user with this refresh token and check if it's not expired
    const user = await User.findOne({ 
      refreshToken,
      refreshTokenExpiry: { $gt: new Date() } // Not expired
    });
    
    if (!user) {
      return next(new ErrorResponse('Invalid or expired refresh token', 401));
    }
    
    // Generate new access token
    const newAccessToken = generateAccessToken(user._id);
    
    // Rotate refresh token
    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenExpiry = setRefreshTokenExpiry();
    
    // Update user with new refresh token
    user.refreshToken = newRefreshToken;
    user.refreshTokenExpiry = newRefreshTokenExpiry;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        accessTokenExpiresIn: '15m',
        refreshTokenExpiresIn: '7d'
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout
// @route   POST /api/v1/auth/logout
// @access  Public
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return next(new ErrorResponse('Refresh token is required', 400));
    }
    
    // Clear refresh token from database
    await User.findOneAndUpdate(
      { refreshToken },
      { 
        refreshToken: null,
        refreshTokenExpiry: null 
      }
    );
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout All Devices
// @route   POST /api/v1/auth/logout-all
// @access  Public
exports.logoutAll = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return next(new ErrorResponse('Refresh token is required', 400));
    }
    
    const user = await User.findOne({ refreshToken });
    
    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }
    
    user.refreshToken = null;
    user.refreshTokenExpiry = null;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Logged out from all devices successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user profile
// @route   GET /api/v1/auth/profile
// @access  Private
exports.getProfile = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return next(new ErrorResponse('User not found', 401));
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profile: user.profile,
        address: user.addresses,
        whislist: user.wishlist,
        settings: {
          notifications: {
            email: user.settings?.notifications?.email ?? true,
            sms: user.settings?.notifications?.sms ?? true,
            promotional: user.settings?.notifications?.promotional ?? true,
            orderUpdates: user.settings?.notifications?.orderUpdates ?? true
          }
        },
        createdAt: user.createdAt,
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile with avatar
// @route   PUT /api/v1/auth/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }

    const {
      username,
      email,
      role,
      profile,
      addresses
    } = req.body;

    const updateData = {};

    if (req.file) {
      const currentProfile = user.profile || {};
      updateData.profile = {
        ...currentProfile.toObject?.() || currentProfile,
        avatar: req.file.path,
        avatarPublicId: req.file.filename
      };
      
      if (profile) {
        try {
          const profileData = typeof profile === 'string' ? JSON.parse(profile) : profile;
          updateData.profile = {
            ...updateData.profile,
            ...profileData
          };
        } catch (error) {
          console.error('Error parsing profile data:', error);
        }
      }
    } else if (profile !== undefined) {
      try {
        const profileData = typeof profile === 'string' ? JSON.parse(profile) : profile;
        const currentProfile = user.profile || {};
        updateData.profile = {
          ...(currentProfile.toObject?.() || currentProfile),
          ...profileData
        };
      } catch (error) {
        return next(new ErrorResponse('Invalid profile data format', 400));
      }
    }

    if (username !== undefined) {
      if (username !== user.username) {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
          return next(new ErrorResponse('Username already taken', 400));
        }
      }
      updateData.username = username;
    }

    if (email !== undefined) {
      if (email !== user.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return next(new ErrorResponse('Email already registered', 400));
        }
      }
      updateData.email = email;
    }

    // Only existing admins may change roles; ignore refreshToken/wishlist from body
    if (role !== undefined) {
      if (user.role !== 'admin') {
        return next(new ErrorResponse('Only admin can change user roles', 403));
      }
      updateData.role = role;
    }

    if (addresses !== undefined) {
      try {
        updateData.addresses =
          typeof addresses === 'string' ? JSON.parse(addresses) : addresses;
      } catch (error) {
        return next(new ErrorResponse('Invalid addresses format', 400));
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password -refreshToken');

    res.status(200).json({
      success: true,
      message: 'User profile updated successfully',
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        profile: updatedUser.profile,
        addresses: updatedUser.addresses,
        wishlist: updatedUser.wishlist,
        createdAt: updatedUser.createdAt
      }
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Check token validity
// @route   POST /api/v1/auth/validate-token
// @access  Public
exports.validateToken = async (req, res, next) => {
  try {
    const { accessToken } = req.body;
    
    if (!accessToken) {
      return next(new ErrorResponse('Access token is required', 400));
    }

    const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return next(new ErrorResponse('Invalid token', 401));
    }

    res.status(200).json({
      success: true,
      message: 'Token is valid',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    return next(new ErrorResponse('Invalid token', 401));
  }
};

// @desc    Get token info (debugging)
// @route   GET /api/v1/auth/token-info
// @access  Public
exports.getTokenInfo = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.cookies?.token;

    if (!token) {
      return next(new ErrorResponse('No token provided', 400));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentTime = Math.floor(Date.now() / 1000);

    res.status(200).json({
      success: true,
      tokenInfo: {
        userId: decoded.id,
        issuedAt: new Date(decoded.iat * 1000).toISOString(),
        expiresAt: new Date(decoded.exp * 1000).toISOString(),
        isExpired: decoded.exp < currentTime,
        expiresIn: decoded.exp - currentTime
      }
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return next(new ErrorResponse('Invalid or expired token', 401));
    }
    next(error);
  }
};
