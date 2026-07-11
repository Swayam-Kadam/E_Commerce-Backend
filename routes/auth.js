const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/UserSchema');
const { uploadAvatar } = require('../middleware/upload');

const router = express.Router();

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

// Register user
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username, email, and password'
      });
    }
    
    if (password.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Password cannot be empty'
      });
    }
    
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or username'
      });
    }
    
    // Hash password before creating user
    const hashedPassword = await hashPassword(password);
    
    // Generate tokens
    const accessToken = generateAccessToken(null); // We'll update after user creation
    const refreshToken = generateRefreshToken();
    const refreshTokenExpiry = setRefreshTokenExpiry();
    
    // Create user with refresh token
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role: role || 'user',
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
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration'
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    if (password.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Password cannot be empty'
      });
    }

    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!user.password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid user account'
      });
    }

    // Compare password using bcrypt
    const isPasswordValid = await comparePassword(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
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
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// Refresh Token - Get new access token using refresh token
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }
    
    // Find user with this refresh token and check if it's not expired
    const user = await User.findOne({ 
      refreshToken,
      refreshTokenExpiry: { $gt: new Date() } // Not expired
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }
    
    // Generate new access token
    const newAccessToken = generateAccessToken(user._id);
    
    // OPTIONAL: Rotate refresh token (for better security)
    // Generate new refresh token
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
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during token refresh'
    });
  }
});

// Logout - Invalidate refresh token
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
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
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
});

// Logout All Devices - Invalidate all user's refresh tokens
router.post('/logout-all', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }
    
    // Find user by refresh token
    const user = await User.findOne({ refreshToken });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Clear refresh token for this user
    user.refreshToken = null;
    user.refreshTokenExpiry = null;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Logged out from all devices successfully'
    });
    
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
});

// Get current user profile
router.get('/profile', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
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
    console.error('Profile error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Access token expired. Please refresh your token.',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

// Update user profile

// router.put('/profile', async (req, res) => {
//   try {
//     const token = req.header('Authorization')?.replace('Bearer ', '');
    
//     if (!token) {
//       return res.status(401).json({
//         success: false,
//         message: 'Access denied. No token provided.'
//       });
//     }

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const user = await User.findById(decoded.id);
    
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: 'User not found'
//       });
//     }

//     // Destructure update data from request body
//     const {
//       username,
//       email,
//       role,
//       profile,
//       addresses,
//       wishlist,
//       refreshToken,
//       refreshTokenExpiry
//     } = req.body;

//     // Prepare update object
//     const updateData = {};

//     // Update basic fields if provided
//     if (username !== undefined) {
//       // Check if username is unique
//       if (username !== user.username) {
//         const existingUser = await User.findOne({ username });
//         if (existingUser) {
//           return res.status(400).json({
//             success: false,
//             message: 'Username already taken'
//           });
//         }
//       }
//       updateData.username = username;
//     }

//     if (email !== undefined) {
//       // Check if email is unique
//       if (email !== user.email) {
//         const existingUser = await User.findOne({ email });
//         if (existingUser) {
//           return res.status(400).json({
//             success: false,
//             message: 'Email already registered'
//           });
//         }
//       }
//       updateData.email = email;
//     }

//     // Only admin can update role
//     if (role !== undefined) {
//       if (user.role !== 'admin' && role !== user.role) {
//         return res.status(403).json({
//           success: false,
//           message: 'Only admin can change user roles'
//         });
//       }
//       updateData.role = role;
//     }

//     // Update profile if provided
//     if (profile !== undefined) {
//       updateData.profile = {
//         ...user.profile.toObject(),
//         ...profile
//       };
//     }

//     // Update addresses if provided
//     if (addresses !== undefined) {
//       updateData.addresses = addresses;
//     }

//     // Update wishlist if provided
//     if (wishlist !== undefined) {
//       updateData.wishlist = wishlist;
//     }

//     // Update refresh token fields if provided (admin only)
//     if (refreshToken !== undefined || refreshTokenExpiry !== undefined) {
//       if (user.role !== 'admin') {
//         return res.status(403).json({
//           success: false,
//           message: 'Only admin can update token fields'
//         });
//       }
//       if (refreshToken !== undefined) updateData.refreshToken = refreshToken;
//       if (refreshTokenExpiry !== undefined) updateData.refreshTokenExpiry = refreshTokenExpiry;
//     }

//     // Update user
//     const updatedUser = await User.findByIdAndUpdate(
//       user._id,
//       { $set: updateData },
//       { new: true, runValidators: true }
//     ).select('-password -refreshToken'); // Exclude sensitive fields

//     res.status(200).json({
//       success: true,
//       message: 'User profile updated successfully',
//       user: {
//         id: updatedUser._id,
//         username: updatedUser.username,
//         email: updatedUser.email,
//         role: updatedUser.role,
//         profile: updatedUser.profile,
//         addresses: updatedUser.addresses,
//         wishlist: updatedUser.wishlist,
//         createdAt: updatedUser.createdAt
//       }
//     });

//   } catch (error) {
//     console.error('Update profile error:', error);
    
//     if (error.name === 'TokenExpiredError') {
//       return res.status(401).json({
//         success: false,
//         message: 'Access token expired. Please refresh your token.',
//         code: 'TOKEN_EXPIRED'
//       });
//     }
    
//     if (error.name === 'JsonWebTokenError') {
//       return res.status(401).json({
//         success: false,
//         message: 'Invalid token'
//       });
//     }
    
//     if (error.name === 'ValidationError') {
//       return res.status(400).json({
//         success: false,
//         message: 'Validation error',
//         errors: error.errors
//       });
//     }
    
//     res.status(500).json({
//       success: false,
//       message: 'Server error during profile update'
//     });
//   }
// });

// Update user profile with avatar upload support
router.put('/profile', uploadAvatar, async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Destructure update data from request body
    const {
      username,
      email,
      role,
      profile,
      addresses,
      wishlist,
      refreshToken,
      refreshTokenExpiry
    } = req.body;

    // Prepare update object
    const updateData = {};

    // Handle avatar upload if file exists
    if (req.file) {
      // Parse existing profile or create new one
      const currentProfile = user.profile || {};
      
      // Update avatar URL from uploaded file
      updateData.profile = {
        ...currentProfile.toObject(),
        avatar: req.file.path, // Cloudinary URL
        avatarPublicId: req.file.filename // Cloudinary public ID
      };
      
      // If other profile data is provided in body, merge it
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
      // If no file but profile data provided
      try {
        const profileData = typeof profile === 'string' ? JSON.parse(profile) : profile;
        const currentProfile = user.profile || {};
        updateData.profile = {
          ...currentProfile.toObject(),
          ...profileData
        };
      } catch (error) {
        console.error('Error parsing profile data:', error);
        return res.status(400).json({
          success: false,
          message: 'Invalid profile data format'
        });
      }
    }

    // Update basic fields if provided
    if (username !== undefined) {
      // Check if username is unique
      if (username !== user.username) {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Username already taken'
          });
        }
      }
      updateData.username = username;
    }

    if (email !== undefined) {
      // Check if email is unique
      if (email !== user.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Email already registered'
          });
        }
      }
      updateData.email = email;
    }

    // Only admin can update role
    if (role !== undefined) {
      if (user.role !== 'admin' && role !== user.role) {
        return res.status(403).json({
          success: false,
          message: 'Only admin can change user roles'
        });
      }
      updateData.role = role;
    }

    // Update addresses if provided
    if (addresses !== undefined) {
      try {
        const addressesData = typeof addresses === 'string' ? JSON.parse(addresses) : addresses;
        updateData.addresses = addressesData;
      } catch (error) {
        console.error('Error parsing addresses:', error);
        return res.status(400).json({
          success: false,
          message: 'Invalid addresses format. Must be valid JSON.'
        });
      }
    }

    // Update wishlist if provided
    if (wishlist !== undefined) {
      try {
        const wishlistData = typeof wishlist === 'string' ? JSON.parse(wishlist) : wishlist;
        updateData.wishlist = wishlistData;
      } catch (error) {
        console.error('Error parsing wishlist:', error);
        return res.status(400).json({
          success: false,
          message: 'Invalid wishlist format. Must be valid JSON.'
        });
      }
    }

    // Update refresh token fields if provided (admin only)
    if (refreshToken !== undefined || refreshTokenExpiry !== undefined) {
      if (user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admin can update token fields'
        });
      }
      if (refreshToken !== undefined) updateData.refreshToken = refreshToken;
      if (refreshTokenExpiry !== undefined) updateData.refreshTokenExpiry = refreshTokenExpiry;
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password -refreshToken'); // Exclude sensitive fields

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
    console.error('Update profile error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Access token expired. Please refresh your token.',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error during profile update'
    });
  }
});

// Check token validity
router.post('/validate-token', async (req, res) => {
  try {
    const { accessToken } = req.body;
    
    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
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
    console.error('Token validation error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

// Get token info (for debugging)
router.get('/token-info', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.decode(token);
    
    if (!decoded) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token format'
      });
    }

    // Check if token is expired
    const currentTime = Math.floor(Date.now() / 1000);
    const isExpired = decoded.exp < currentTime;
    
    res.status(200).json({
      success: true,
      tokenInfo: {
        userId: decoded.id,
        issuedAt: new Date(decoded.iat * 1000).toISOString(),
        expiresAt: new Date(decoded.exp * 1000).toISOString(),
        isExpired,
        expiresIn: decoded.exp - currentTime
      }
    });

  } catch (error) {
    console.error('Token info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;