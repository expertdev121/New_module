  import { paymentMethods, paymentMethodDetails } from "@/lib/db/schema";

  const paymentMethodsData = [
    { value: "ach", label: "ACH" },
    { value: "bill_pay", label: "Bill Pay" },
    { value: "cash", label: "Cash" },
    { value: "check", label: "Check" },
    { value: "credit", label: "Credit" },
    { value: "credit_card", label: "Credit Card" },
    { value: "expected", label: "Expected" },
    { value: "goods_and_services", label: "Goods and Services" },
    { value: "matching_funds", label: "Matching Funds" },
    { value: "money_order", label: "Money Order" },
    { value: "p2p", label: "P2P" },
    { value: "pending", label: "Pending" },
    { value: "bank_transfer", label: "Bank Transfer" },
    { value: "refund", label: "Refund" },
    { value: "scholarship", label: "Scholarship" },
    { value: "stock", label: "Stock" },
    { value: "student_portion", label: "Student Portion" },
    { value: "unknown", label: "Unknown" },
    { value: "wire", label: "Wire" },
    { value: "xfer", label: "Xfer" },
    { value: "other", label: "Other" },
  ] as const;

  // Map each method detail to its appropriate payment method
  const methodDetailsData = [
    { value: "achisomoch", label: "Achisomoch", paymentMethod: "ach" },
    { value: "authorize", label: "Authorize", paymentMethod: "credit_card" },
    { value: "bank_of_america_charitable", label: "Bank of America Charitable", paymentMethod: "bank_transfer" },
    { value: "banquest", label: "Banquest", paymentMethod: "credit_card" },
    { value: "banquest_cm", label: "Banquest CM", paymentMethod: "credit_card" },
    { value: "benevity", label: "Benevity", paymentMethod: "bank_transfer" },
    { value: "chai_charitable", label: "Chai Charitable", paymentMethod: "bank_transfer" },
    { value: "charityvest_inc", label: "Charityvest Inc.", paymentMethod: "bank_transfer" },
    { value: "cjp", label: "CJP", paymentMethod: "bank_transfer" },
    { value: "donors_fund", label: "Donors' Fund", paymentMethod: "bank_transfer" },
    { value: "earthport", label: "EarthPort", paymentMethod: "bank_transfer" },
    { value: "e_transfer", label: "e-transfer", paymentMethod: "bank_transfer" },
    { value: "facts", label: "FACTS", paymentMethod: "credit_card" },
    { value: "fidelity", label: "Fidelity", paymentMethod: "bank_transfer" },
    { value: "fjc", label: "FJC", paymentMethod: "bank_transfer" },
    { value: "foundation", label: "Foundation", paymentMethod: "bank_transfer" },
    { value: "goldman_sachs", label: "Goldman Sachs", paymentMethod: "bank_transfer" },
    { value: "htc", label: "HTC", paymentMethod: "bank_transfer" },
    { value: "jcf", label: "JCF", paymentMethod: "bank_transfer" },
    { value: "jcf_san_diego", label: "JCF San Diego", paymentMethod: "bank_transfer" },
    { value: "jgive", label: "Jgive", paymentMethod: "credit_card" },
    { value: "keshet", label: "Keshet", paymentMethod: "bank_transfer" },
    { value: "masa", label: "MASA", paymentMethod: "bank_transfer" },
    { value: "masa_old", label: "MASA Old", paymentMethod: "bank_transfer" },
    { value: "matach", label: "Matach", paymentMethod: "bank_transfer" },
    { value: "matching_funds", label: "Matching Funds", paymentMethod: "matching_funds" },
    { value: "mizrachi_canada", label: "Mizrachi Canada", paymentMethod: "bank_transfer" },
    { value: "mizrachi_olami", label: "Mizrachi Olami", paymentMethod: "bank_transfer" },
    { value: "montrose", label: "Montrose", paymentMethod: "bank_transfer" },
    { value: "morgan_stanley_gift", label: "Morgan Stanley Gift", paymentMethod: "bank_transfer" },
    { value: "ms", label: "MS", paymentMethod: "bank_transfer" },
    { value: "mt", label: "MT", paymentMethod: "bank_transfer" },
    { value: "ojc", label: "OJC", paymentMethod: "bank_transfer" },
    { value: "paypal", label: "PayPal", paymentMethod: "p2p" },
    { value: "pelecard", label: "PeleCard (EasyCount)", paymentMethod: "credit_card" },
    { value: "schwab_charitable", label: "Schwab Charitable", paymentMethod: "bank_transfer" },
    { value: "stripe", label: "Stripe", paymentMethod: "credit_card" },
    { value: "tiaa", label: "TIAA", paymentMethod: "bank_transfer" },
    { value: "touro", label: "Touro", paymentMethod: "bank_transfer" },
    { value: "uktoremet", label: "UKToremet (JGive)", paymentMethod: "bank_transfer" },
    { value: "vanguard_charitable", label: "Vanguard Charitable", paymentMethod: "bank_transfer" },
    { value: "venmo", label: "Venmo", paymentMethod: "p2p" },
    { value: "vmm", label: "VMM", paymentMethod: "bank_transfer" },
    { value: "wise", label: "Wise", paymentMethod: "bank_transfer" },
    { value: "worldline", label: "Worldline", paymentMethod: "credit_card" },
    { value: "yaadpay", label: "YaadPay", paymentMethod: "credit_card" },
    { value: "yaadpay_cm", label: "YaadPay CM", paymentMethod: "credit_card" },
    { value: "yourcause", label: "YourCause", paymentMethod: "bank_transfer" },
    { value: "yu", label: "YU", paymentMethod: "bank_transfer" },
    { value: "zelle", label: "Zelle", paymentMethod: "p2p" },
  ] as const;

  async function seed() {
    process.env.DATABASE_URL = 'postgresql://levhatora_final_owner:npg_FmBlvp78SNqZ@ep-delicate-smoke-a9zveme7-pooler.gwc.azure.neon.tech/levhatora_final?sslmode=require&channel_binding=require'
    
    const { db } = await import("@/lib/db");

    try {
      // Insert payment methods
      const insertedMethods = await db
        .insert(paymentMethods)
        .values(
          paymentMethodsData.map((item) => ({
            name: item.label,
            description: item.value,
            isActive: true,
          }))
        )
        .returning({ id: paymentMethods.id, value: paymentMethods.description });

      // Create a map from value to id
      const methodMap = new Map(insertedMethods.map((m) => [m.value, m.id]));

      // Insert method details with correct payment method relationships
      const detailsToInsert = methodDetailsData.map((item) => {
        const paymentMethodId = methodMap.get(item.paymentMethod);
        if (!paymentMethodId) {
          throw new Error(`No matching payment method found for ${item.paymentMethod}`);
        }
        return {
          paymentMethodId,
          key: item.value,
          value: item.label,
        };
      });

      await db.insert(paymentMethodDetails).values(detailsToInsert);

      console.log("Payment methods and details seeded successfully");
    } catch (error) {
      console.error("Error seeding payment methods:", error);
    } finally {
      process.exit(0);
    }
  }

  seed();