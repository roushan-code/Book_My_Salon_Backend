import catchAsyncErrors from "../middleware/catchAsyncErrors.js";
import ShopDetails from "../models/ShopDetails.js";
import SpamList from "../models/SpamList.js";
import User from "../models/User.js";
import ErrorHandler from "../utils/errorhandler.js";
import Booking from "../models/Booking.js";
import { deleteFilesFromCloudinary, uploadFilesToCloudinary } from "../utils/features.js";
import { handleProfileImageUpload, validateServices } from "../utils/uploadUtils.js";
import { getPaginationOptions, formatPaginationResponse } from "../utils/dbUtils.js";

// Create or Update shop details
export const createOrUpdateShopDetails = catchAsyncErrors(async (req, res, next) => {
    const barber_id = req.user._id;
    const file = req.file;

    const {
        shop_name,   // ✅ ADDED
        shop_address,
        phone,
        opening_hours,
        closing_days,
        tiffin_time,
        today_open,
        half_closing_day,
        services,
        slot_interval,
    } = req.body;

    // ✅ Updated validation
    if (!shop_name || !shop_address || !phone) {
        return next(new ErrorHandler("Shop name, address and phone are required", 400));
    }

    const serviceValidation = validateServices(services);
    if (!serviceValidation.valid) {
        return next(new ErrorHandler(serviceValidation.message, 400));
    }

    const [barberDetails, existingShopDetails] = await Promise.all([
        User.findById(barber_id),
        ShopDetails.findOne({ barber_id }).populate('barber_id', 'name email phone profileUrl')
    ]);

    if (!barberDetails) {
        return next(new ErrorHandler("Barber not found", 404));
    }

    if (barberDetails.phone !== phone) {
        barberDetails.phone = phone;
        await barberDetails.save();
    }

    const profileUrl = await handleProfileImageUpload(
        file,
        existingShopDetails?.profileUrl,
        uploadFilesToCloudinary,
        deleteFilesFromCloudinary
    );

    if (profileUrl.url && barberDetails.profileUrl !== profileUrl.url) {
        barberDetails.profileUrl = profileUrl.url;
        await barberDetails.save();
    }

    // ✅ Added shop_name here
    const shopData = {
        barber_id,
        shop_name,
        shop_address,
        phone,
        opening_hours: opening_hours || { start: "09:00", end: "20:00" },
        closing_days: closing_days || [],
        tiffin_time: tiffin_time || { start: "13:00", end: "14:00" },
        today_open: today_open !== undefined ? today_open : true,
        half_closing_day: half_closing_day || null,
        services: services || [],
        slot_interval: slot_interval || 15,
        profileUrl
    };

    let shopDetails;

    if (existingShopDetails) {
        Object.assign(existingShopDetails, shopData);
        shopDetails = await existingShopDetails.save();
    } else {
        shopDetails = await ShopDetails.create(shopData);
    }

    res.status(200).json({
        success: true,
        message: existingShopDetails
            ? "Shop details updated successfully"
            : "Shop details created successfully",
        data: shopDetails
    });
});

// Get shop details by barber ID
export const getShopDetails = catchAsyncErrors(async (req, res, next) => {
    const { barberId } = req.params;

    const shopDetails = await ShopDetails.findOne({ barber_id: barberId })
        .populate('barber_id', 'name email phone profileUrl');

    if (!shopDetails) {
        return next(new ErrorHandler("Shop details not found", 404));
    }

    res.status(200).json({
        success: true,
        data: shopDetails
    });
});

// Get barber's own shop details
export const getMyShopDetails = catchAsyncErrors(async (req, res, next) => {
    const barber_id = req.user.id;

    const shopDetails = await ShopDetails.findOne({ barber_id })
        .populate('barber_id', 'name email phone profileUrl');

    if (!shopDetails) {
        return next(new ErrorHandler("Shop details not found. Please create shop details first.", 404));
    }

    res.status(200).json({
        success: true,
        data: shopDetails
    });
});

// Toggle today open status
export const toggleTodayOpen = catchAsyncErrors(async (req, res, next) => {
    const barber_id = req.user.id;

    const shopDetails = await ShopDetails.findOne({ barber_id });
    if (!shopDetails) {
        return next(new ErrorHandler("Shop details not found", 404));
    }

    shopDetails.today_open = !shopDetails.today_open;
    await shopDetails.save();

    res.status(200).json({
        success: true,
        message: `Shop is now ${shopDetails.today_open ? 'open' : 'closed'} for today`,
        data: { today_open: shopDetails.today_open }
    });
});

// Add customer to spam list
export const addToSpamList = catchAsyncErrors(async (req, res, next) => {
    const barber_id = req.user.id;
    const { phone, reason } = req.body;
    const blocked_date = new Date();

    if (!phone) {
        return next(new ErrorHandler("phone number is required", 400));
    }

    // Check if customer exists
    const customer = await User.find({ phone });

    if (!customer || customer[0].role !== 'customer') {
        return next(new ErrorHandler("Customer not found", 404));
    }

    // Check if already in spam list
    const existingSpam = await SpamList.findOne({ barber_id, customer_id: customer[0]._id });
    if (existingSpam) {
        return next(new ErrorHandler("Customer is already in spam list", 400));
    }

    const spamEntry = await SpamList.create({
        barber_id,
        customer_id: customer[0]._id,
        customer_name: customer[0].name,
        reason,
        customer_email: customer[0].email,
        customer_phone: customer[0].phone,
        blocked_date: blocked_date
    });

    // Remove all bookings of this customer where this barber is one of the service providers
    await Booking.deleteMany({
        'customerdetails.customer_id': customer[0]._id,
        'serviceProviders': {
            $elemMatch: { 'barber_id': barber_id }
        },
        payment: 'pending'
    });

    res.status(201).json({
        success: true,
        message: "Customer added to spam list successfully",
        data: spamEntry
    });
});

// Get spam list
export const getSpamList = catchAsyncErrors(async (req, res, next) => {
    const barber_id = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const { skip, limit: parsedLimit, page: parsedPage } = getPaginationOptions(page, limit);

    // Parallel execution for better performance
    const [spamList, total] = await Promise.all([
        SpamList.find({ barber_id })
            .populate('customer_id', 'name email phone profileUrl')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parsedLimit)
            .lean(),
        SpamList.countDocuments({ barber_id })
    ]);

    const response = formatPaginationResponse(spamList, total, parsedPage, parsedLimit);

    res.status(200).json({
        success: true,
        data: {
            spam_list: response.data,
            pagination: response.pagination
        }
    });
});

// Remove from spam list
export const removeFromSpamList = catchAsyncErrors(async (req, res, next) => {
    const barber_id = req.user.id;
    const { customer_id } = req.params;

    const spamEntry = await SpamList.findOneAndDelete({ barber_id, customer_id });
    if (!spamEntry) {
        return next(new ErrorHandler("Customer not found in spam list", 404));
    }

    res.status(200).json({
        success: true,
        message: "Customer removed from spam list successfully"
    });
});



// Get all barbers for customers
export const getAllBarbers = catchAsyncErrors(async (req, res, next) => {
    const barbers = await ShopDetails.find()
        .populate('barber_id', 'name email phone profileUrl gender')
        .select('shop_name shop_address phone opening_hours services today_open barber_id');

    res.status(200).json({
        success: true,
        data: {
            barbers
        }
    });
});

// Search shops by barber name or shop address
export const searchShops = catchAsyncErrors(async (req, res, next) => {
    const { query } = req.query;

    if (!query || !query.trim()) {
        return next(new ErrorHandler("Search query is required", 400));
    }

    // 🔥 Split into keywords
    const keywords = query.trim().split(/\s+/);

    const shops = await ShopDetails.aggregate([
        {
            $lookup: {
                from: "users",
                localField: "barber_id",
                foreignField: "_id",
                as: "barber"
            }
        },
        { $unwind: "$barber" },

        // 🔥 Match ALL keywords (important)
        {
            $match: {
                $and: keywords.map(word => ({
                    $or: [
                        { shop_name: { $regex: word, $options: "i" } },
                        { shop_address: { $regex: word, $options: "i" } }
                    ]
                }))
            }
        },

        // ✅ Return FULL shop details
        {
            $project: {
                _id: 1,
                shop_name: 1,
                shop_address: 1,
                phone: 1,
                opening_hours: 1,
                closing_days: 1,
                tiffin_time: 1,
                today_open: 1,
                half_closing_day: 1,
                services: 1,
                slot_interval: 1,
                profileUrl: 1,
                created_at: 1,
                updated_at: 1,

                // Barber details
                barber: {
                    _id: "$barber._id",
                    name: "$barber.name",
                    email: "$barber.email",
                    phone: "$barber.phone",
                    profileUrl: "$barber.profileUrl",
                    gender: "$barber.gender"
                }
            }
        }
    ]);

    res.status(200).json({
        success: true,
        data: {
            shops,
            total: shops.length,
            query: query.trim()
        }
    });
});